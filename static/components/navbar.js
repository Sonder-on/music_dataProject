document.addEventListener('DOMContentLoaded', () => {
    initNavbarUserInfo();
    initNavbarDropdown();
    autoHighlightNavBtn();
});


// 1. 获取并渲染当前登录的用户信息
function initNavbarUserInfo() {
    const avatar = document.getElementById('topAvatar');
    if (!avatar) return;

    fetch('/api/user/current')
        .then(res => res.json())
        .then(res => {
            if (res.code === 200) {
                document.getElementById('dropdownUsername').innerText = res.data.username;
                document.getElementById('dropdownRole').innerText = res.data.role === 'admin' ? '系统管理员' : '普通用户';
                avatar.innerText = res.data.username.charAt(0).toUpperCase();
            }
        }).catch(err => console.error("获取用户信息失败:", err));
}


// 2. 绑定导航栏头像的下拉菜单点击交互事件
function initNavbarDropdown() {
    const avatar = document.getElementById('topAvatar');
    const dropdown = document.getElementById('profileDropdown');

    if (avatar && dropdown) {
        avatar.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });
        document.addEventListener('click', () => {
            dropdown.style.display = 'none';
        });
    }
}


// 3. 处理用户退出登录请求
function handleLogout() {
    if (!confirm("确定要退出登录吗？")) return;
    fetch('/api/logout', { method: 'POST' })
        .then(res => res.json())
        .then(res => {
            if (res.code === 200) window.location.href = '/login';
        });
}


// 4. 根据当前页面路径自动匹配并高亮对应的导航栏按钮
function autoHighlightNavBtn() {
    const currentPath = window.location.pathname;
    const navBtns = document.querySelectorAll('.top-nav-bar .nav-btn');

    navBtns.forEach(btn => {
        btn.classList.remove('active');
        const onclickAttr = btn.getAttribute('onclick') || '';

        if (onclickAttr.includes(currentPath) && currentPath !== '/') {
            btn.classList.add('active');
        }
    });
}