from exts import db
from models import User
from utils import encrypt_md5
from app import create_app

app = create_app()

# 2. 开启应用上下文 (极其重要：告诉 db 绑定到这个 app 上)
with app.app_context():
    # 检查 admin 是否存在
    if not User.query.filter_by(username='admin').first():
        admin_user = User(username='admin', password=encrypt_md5('1234'), role='admin')
        db.session.add(admin_user)
        print("✅ 管理员账号 (admin) 准备创建...")

    # 提交到数据库
    db.session.commit()
    print("🎉 初始用户检查/创建成功！")
