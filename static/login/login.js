// 用于标记当前是登录模式还是注册模式
let isLoginMode = true;

// 切换登录/注册模式
function toggleMode(event) {
    event.preventDefault();
    isLoginMode = !isLoginMode;

    const formTitle = document.querySelector('.form-title');
    const loginBtn = document.getElementById('loginBtn');
    const formOptions = document.querySelector('.form-options');
    const hintText = document.querySelector('.register-hint');

    if (isLoginMode) {
        formTitle.innerText = '欢迎回来';
        loginBtn.innerText = '登录进入大盘';
        formOptions.style.display = 'flex';
        hintText.innerHTML = '还没有平台权限？ <a href="#" onclick="toggleMode(event)">申请内测账号</a>';
    } else {
        formTitle.innerText = '创建新账号';
        loginBtn.innerText = '立即注册';
        formOptions.style.display = 'none'; // 注册时隐藏“记住我”和“忘记密码”
        hintText.innerHTML = '已有账号？ <a href="#" onclick="toggleMode(event)">返回登录</a>';
    }
}

// 绑定初始的点击切换事件
document.querySelector('.register-hint a').addEventListener('click', toggleMode);

// 处理表单提交
async function handleLogin(event) {
    event.preventDefault();

    const btn = document.getElementById('loginBtn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        alert("用户名和密码不能为空！");
        return;
    }

    // 保存原始按钮文字，并设置为加载状态
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerHTML = isLoginMode ? '验证身份中...' : '正在注册...';

    // 根据模式决定请求的后端接口
    const endpoint = isLoginMode ? '/api/login' : '/api/register';

    try {
        // 向 Flask 后端发送真实的 POST 请求
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username: username, password: password })
        });

        const result = await response.json();

        if (response.ok && result.code === 200) {
            if (isLoginMode) {
                // 登录成功
                btn.innerHTML = '登录成功，正在跳转...';
                btn.style.backgroundColor = '#3ae374'; // 成功时按钮变绿
                setTimeout(() => {
                    // 如果是管理员，可以跳转到专门的管理界面；这里统一跳总览
                    window.location.href = '/index';
                }, 800);
            } else {
                // 注册成功
                alert("注册成功！请使用新账号登录。");
                // 自动切回登录模式，并清空密码框
                toggleMode(new Event('click'));
                passwordInput.value = '';
                btn.disabled = false;
                btn.innerHTML = '登录进入大盘';
            }
        } else {
            // 登录或注册失败 (如密码错误、用户名已被占用)
            alert(result.msg || "操作失败，请重试");
            btn.disabled = false;
            btn.innerHTML = originalText;
            passwordInput.value = ''; // 失败后清空密码让用户重输
        }
    } catch (error) {
        console.error("请求出错:", error);
        alert("服务器连接异常，请检查后端是否启动。");
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}