# -*- coding: utf-8 -*-
import logging
from flask import Flask, render_template
import config
from exts import db
from utils import login_required
import os

# 导入所有蓝图车间
from api.auth import auth_bp
from api.dashboard import dashboard_bp
from api.search import search_bp
from api.user_taste import taste_bp

os.environ['LOKY_MAX_CPU_COUNT'] = '6'
# 过滤无用日志
class EndpointFilter(logging.Filter):
    def filter(self, record):
        return '/realtime_trend' not in record.getMessage()


logging.getLogger('werkzeug').addFilter(EndpointFilter())


def create_app():
    app = Flask(__name__)

    # 注入配置与数据库
    app.config.from_object(config)
    db.init_app(app)

    # 注册蓝图 (统一前缀 /api)
    app.register_blueprint(auth_bp, url_prefix='/api')
    app.register_blueprint(dashboard_bp, url_prefix='/api')
    app.register_blueprint(search_bp, url_prefix='/api')
    app.register_blueprint(taste_bp, url_prefix='/api')

    # ========== 纯前端页面路由 ==========
    @app.route('/')
    @app.route('/login', methods=['GET'])
    def login_page(): return render_template('login/login.html')

    @app.route('/index')
    @login_required
    def index(): return render_template('index/index.html')

    @app.route('/leaderboard')
    @login_required
    def leaderboard(): return render_template('leaderboard/leaderboard.html')

    @app.route('/albums')
    @login_required
    def albums(): return render_template('album/album.html')

    @app.route('/artists')
    @login_required
    def artists(): return render_template('artist/artist.html')

    @app.route('/user')
    @login_required
    def user(): return render_template('user/user.html')

    @app.route('/profile')
    def profile(): return render_template('profile/profile.html')

    @app.route('/track')
    @login_required
    def track(): return render_template('track/track.html')

    return app


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5000)