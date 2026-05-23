# -*- coding: utf-8 -*-
from flask import Blueprint, request, jsonify, session
from models import User
from exts import db
from utils import encrypt_md5

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['POST'])
def api_login():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'code': 400, 'msg': '用户名或密码不能为空'})

    user = User.query.filter_by(username=data['username']).first()
    if user and user.password == encrypt_md5(data['password']):
        session.update({'user_id': user.id, 'username': user.username, 'role': user.role})
        return jsonify({'code': 200, 'msg': '登录成功', 'role': user.role})
    return jsonify({'code': 401, 'msg': '用户名或密码错误'})

@auth_bp.route('/register', methods=['POST'])
def api_register():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'code': 400, 'msg': '用户名或密码不能为空'})

    if User.query.filter_by(username=data['username']).first():
        return jsonify({'code': 409, 'msg': '该用户名已被注册'})

    new_user = User(username=data['username'], password=encrypt_md5(data['password']), role='user')
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'code': 200, 'msg': '注册成功，请登录'})

@auth_bp.route('/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'code': 200, 'msg': '已退出登录'})

@auth_bp.route('/user/current', methods=['GET'])
def get_current_user():
    if 'user_id' not in session: return jsonify({'code': 401, 'msg': '未登录'})
    return jsonify({'code': 200, 'data': {'id': session['user_id'], 'username': session['username'], 'role': session['role']}})

@auth_bp.route('/user/list', methods=['GET'])
def get_user_list():
    if session.get('role') != 'admin': return jsonify({'code': 403, 'msg': '权限不足'})
    return jsonify({'code': 200, 'data': [{'id': u.id, 'username': u.username, 'role': u.role} for u in User.query.all()]})

@auth_bp.route('/user/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    if 'user_id' not in session: return jsonify({'code': 401, 'msg': '未登录'})
    target_user = User.query.get(user_id)
    if not target_user: return jsonify({'code': 404, 'msg': '找不到该用户'})

    if session.get('role') != 'admin' and session.get('user_id') != user_id:
        return jsonify({'code': 403, 'msg': '无权限执行此操作'})

    db.session.delete(target_user)
    db.session.commit()
    if session.get('user_id') == user_id: session.clear()
    return jsonify({'code': 200, 'msg': '账号已删除'})