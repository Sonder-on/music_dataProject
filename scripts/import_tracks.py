# -*- coding: utf-8 -*-
import os
import sys
import time
import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.types import VARCHAR, Text

# 把项目的根目录加入系统路径，这样才能顺利导入上一级的 config.py
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

# ==========================================
# 1. 目标文件名和表名
# ==========================================
# 获取当前脚本所在目录，确保不管在哪执行都能找到 csv 文件
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE_PATH = os.path.join(BASE_DIR, 'spotify_tracks.csv')
TABLE_NAME = 'spotify_tracks'

def main():
    print(f"[{time.strftime('%H:%M:%S')}] 正在连接数据库...")

    try:
        # 🌟 优化点：直接使用 config.py 里的数据库配置，不再硬编码密码
        engine = create_engine(config.SQLALCHEMY_DATABASE_URI)
        with engine.connect() as conn:
            pass
        print(f"[{time.strftime('%H:%M:%S')}] 数据库连接成功！\n")
    except Exception as e:
        print(f"\n❌ 数据库连接失败: {e}")
        sys.exit(1)

    print(f"开始导入文件 '{CSV_FILE_PATH}'...")
    start_time = time.time()

    try:
        dtype_dict = {
            'track_id': VARCHAR(255),
            'artists': Text,
            'album_name': Text,
            'track_name': Text,
            'release_date': VARCHAR(50),
            'year': VARCHAR(10),
            'track_genre': VARCHAR(100)
        }

        chunk_size = 5000
        total_inserted = 0

        # 注意：如果之前导入失败留下了残余表，建议在数据库里执行 DROP TABLE spotify_tracks;
        for chunk in pd.read_csv(
                CSV_FILE_PATH,
                chunksize=chunk_size,
                dtype={'release_date': str, 'year': str},
                low_memory=False,
                encoding='gb18030'
        ):
            if 'track_id' in chunk.columns:
                chunk = chunk.dropna(subset=['track_id'])

            chunk.to_sql(
                name=TABLE_NAME,
                con=engine,
                if_exists='append',
                index=False,
                dtype=dtype_dict
            )

            total_inserted += len(chunk)
            print(f"  -> 已成功处理并插入 {total_inserted} 条记录...")

        end_time = time.time()
        print(f"\n✅ 全部导入完成！共计导入 {total_inserted} 条记录。")
        print(f"⏱️ 脚本总耗时: {end_time - start_time:.2f} 秒")

    except Exception as e:
        print(f"\n❌ 导入过程中发生错误:\n{e}")

if __name__ == "__main__":
    main()