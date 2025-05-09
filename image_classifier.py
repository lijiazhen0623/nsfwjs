import os
import requests
import shutil
import concurrent.futures
import argparse
import logging
import threading
import time
from pathlib import Path
from queue import Queue
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import signal
import sys
from tqdm import tqdm

# 配置参数
API_BASE_URL = "http://127.0.0.1:3000"
SINGLE_ENDPOINT = f"{API_BASE_URL}/api/nsfw/classify"
INPUT_FOLDER = r"输入文件夹"
NSFW_FOLDER = "nsfw_images"
SAFE_FOLDER = "safe_images"
REVIEW_FOLDER = "review_images"
LOG_FOLDER = "logs"
MAX_WORKERS = 5  # 默认线程数

# MIME类型映射
MIME_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp'
}

# 初始化文件夹
for folder in [INPUT_FOLDER, NSFW_FOLDER, SAFE_FOLDER, REVIEW_FOLDER, LOG_FOLDER]:
    Path(folder).mkdir(parents=True, exist_ok=True)

# 日志配置
class ThreadSafeLogWriter:
    def __init__(self, log_file):
        self.log_file = log_file
        self.lock = threading.Lock()
        self.queue = Queue()
        self.writer_thread = threading.Thread(target=self._write_worker, daemon=True)
        self.writer_thread.start()

    def write(self, message):
        self.queue.put(message)

    def _write_worker(self):
        with open(self.log_file, "a", encoding="utf-8") as f:
            while True:
                message = self.queue.get()
                with self.lock:
                    f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - {message}\n")
                    f.flush()
                self.queue.task_done()

    def close(self):
        self.queue.join()
        self.writer_thread.join(timeout=1)

# 全局日志对象
error_log = logging.getLogger("nsfw_classifier")
error_log.addHandler(logging.FileHandler(os.path.join(LOG_FOLDER, "error.log"), encoding='utf-8'))
result_log = ThreadSafeLogWriter(os.path.join(LOG_FOLDER, "result.log"))

# 文件操作锁
file_lock = threading.Lock()

def create_session():
    """创建带重试机制的请求会话"""
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=[500, 502, 503, 504]
    )
    adapter = HTTPAdapter(
        max_retries=retry,
        pool_connections=100,
        pool_maxsize=100
    )
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session

class RequestLimiter:
    """请求频率限制器"""
    def __init__(self, max_rps):
        self.min_interval = 1.0 / max_rps
        self.last_request = 0
        self.lock = threading.Lock()

    def wait(self):
        with self.lock:
            elapsed = time.time() - self.last_request
            if elapsed < self.min_interval:
                time.sleep(self.min_interval - elapsed)
            self.last_request = time.time()

request_limiter = RequestLimiter(12)  # 每秒最多12个请求

def is_nsfw(pred):
    """
    三级分类系统（safe/review/nsfw）
    特点：双重验证机制 + 风险置信度分层
    """
    p = pred['porn']
    s = pred['sexy']
    h = pred['hentai']
    d = pred['drawing']
    n = pred['neutral']
    
    debug_info = {
        'values': {k: round(v,3) for k,v in pred.items()},
        'risk_level': None
    }

    # ======================
    # 1. 快速安全通道（保持稳定）
    # ======================
    safe_conditions = [
        d > 0.7 or n > 0.85,
        d > 0.6 and p < 0.15 and h < 0.2,
        p < 0.25 and h < 0.3 and s < 0.45
    ]
    if any(safe_conditions):
        debug_info['rule'] = 'instant_safe'
        return 'safe', debug_info

    # ======================
    # 2. 核心NSFW检测（新增分层验证）
    # ======================
    # 第一层：基础阈值检测
    nsfw_primary = [
        p > 0.52,                    # 降低porn阈值
        h > 0.7 and d < 0.3,         # 放宽hentai绘画限制
        (p**1.7)*3.2 + (h**1.3)*2 > 2.5  # 强化组合风险
    ]
    
    # 第二层：特征联合验证（防止单一特征误判）
    nsfw_secondary = [
        p > 0.45 and d < 0.4,        # 中高porn+低绘画
        h > 0.6 and (d < 0.25 or p > 0.2),
        s > 0.55 and p > 0.35        # 高性感+中色情
    ]
    
    # 双重验证机制
    if any(nsfw_primary) and any(nsfw_primary + nsfw_secondary):
        debug_info.update({
            'rule': 'confirmed_nsfw',
            'risk_level': 'high',
            'primary_flags': [i for i, flag in enumerate(nsfw_primary) if flag],
            'secondary_flags': [i for i, flag in enumerate(nsfw_secondary) if flag]
        })
        return 'nsfw', debug_info

    # ======================
    # 3. 精准审核过滤（新增风险分级）
    # ======================
    # 高风险审核项（接近NSFW阈值）
    high_risk_review = [
        0.48 <= p < 0.52,
        0.65 <= h < 0.7,
        (p**1.5)*2.5 + (h**1.2)*1.8 > 2.2
    ]
    
    # 中风险审核项（需要人工确认）
    mid_risk_review = [
        0.4 <= p < 0.48,
        0.55 <= h < 0.65,
        d > 0.5 and p > 0.3
    ]
    
    # 优先将高风险审核项升级为NSFW
    if any(high_risk_review) and p + h > 0.9:
        debug_info.update({
            'rule': 'elevated_to_nsfw',
            'risk_level': 'critical'
        })
        return 'nsfw', debug_info

    # ======================
    # 4. 最终分类决策
    # ======================
    if any(high_risk_review + mid_risk_review):
        debug_info['rule'] = 'review_candidate'
        return 'review', debug_info
    else:
        # 最终安全验证（新增绘画特征补偿）
        if (d + n) > 1.1 or (d > 0.5 and p + h < 0.4):
            debug_info['rule'] = 'final_safe'
            return 'safe', debug_info
        else:
            debug_info['rule'] = 'uncertain_review'
            return 'review', debug_info




def classify_image(image_path):
    """分类单张图片"""
    try:
        request_limiter.wait()
        session = create_session()
        
        # 获取文件扩展名并确定MIME类型
        ext = os.path.splitext(image_path)[1].lower()
        mime_type = MIME_TYPES.get(ext, 'application/octet-stream')
        
        with open(image_path, 'rb') as img:
            files = {'image': (os.path.basename(image_path), img, mime_type)}
            resp = session.post(SINGLE_ENDPOINT, files=files, timeout=15)
        if resp.status_code == 200:
            preds = resp.json()
            return is_nsfw(preds)
        else:
            error_log.error(f"接口返回异常 {resp.status_code} for {image_path}")
            return None, None
    except Exception as e:
        error_log.error(f"处理失败 {image_path}: {e}")
        return None, None
    finally:
        session.close()

def move_file(src, dst_folder):
    """线程安全的文件移动"""
    filename = os.path.basename(src)
    dst = os.path.join(dst_folder, filename)
    with file_lock:
        if os.path.exists(dst):
            base, ext = os.path.splitext(filename)
            dst = os.path.join(dst_folder, f"{base}_{int(time.time())}{ext}")
        try:
            shutil.move(src, dst)
            return dst
        except Exception as e:
            error_log.error(f"移动失败 {src} -> {dst}: {e}")
            return None

def process_file(filename):
    """处理单个文件"""
    if not filename.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp')):
        return None
    src = os.path.join(INPUT_FOLDER, filename)
    cls, info = classify_image(src)
    if cls is None:
        return None
    target = {
        'nsfw': NSFW_FOLDER,
        'safe': SAFE_FOLDER,
        'review': REVIEW_FOLDER
    }[cls]
    moved = move_file(src, target)
    if moved:
        info_str = " | ".join(f"{k}:{v}" for k,v in info.items())
        line = f"{filename} -> {cls.upper()} ({target}) | {info_str}"
        result_log.write(line)
        return line
    return None

def signal_handler(sig, frame):
    print("\n正在优雅退出...")
    result_log.close()
    sys.exit(0)

def main():
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    parser = argparse.ArgumentParser(description="NSFW 图片分类工具")
    parser.add_argument('-t', '--threads', type=int, default=MAX_WORKERS,
                        help=f"线程数量 (默认: {MAX_WORKERS})")
    args = parser.parse_args()

    files = [f for f in os.listdir(INPUT_FOLDER)
             if f.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'))]
    if not files:
        print("没有找到可处理的图片文件")
        return

    print(f"发现 {len(files)} 张图片，使用 {args.threads} 个线程开始处理...")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.threads) as ex:
        futures = [ex.submit(process_file, f) for f in files]
        for _ in tqdm(concurrent.futures.as_completed(futures), total=len(files)):
            pass

    print("处理完成！")

if __name__ == "__main__":
    main()
