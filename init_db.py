from app import create_app
from exts import db

# 🌟 极其关键：明确把新加的 SearchHistory 表导入进来，让 SQLAlchemy “看”到它
from models import SearchHistory, User, Artist, Album, SpotifyTrack

app = create_app()

with app.app_context():
    print("正在连接数据库并检查表结构...")
    # create_all 会自动对比，如果表不存在就会立刻创建
    db.create_all()
    print("🎉 数据库强制建表成功！SearchHistory 表已就绪。")