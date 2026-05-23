let currentUserId = null;
let isAdminView = false;


// 1. 页面加载初始化，验证用户身份并分流渲染基础信息、操作按钮及收藏视图
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/user/current');
        const result = await response.json();

        if (result.code === 401) {
            alert("请先登录！");
            window.location.href = '/login';
            return;
        }

        if (result.code === 200) {
            const user = result.data;
            currentUserId = user.id;

            document.getElementById('displayUsername').innerText = user.username;
            document.getElementById('userAvatar').innerText = user.username.charAt(0).toUpperCase();

            const roleBadge = document.getElementById('displayRole');
            roleBadge.innerText = user.role === 'admin' ? '✓ 系统管理员 (Admin)' : '普通用户 (User)';
            if (user.role === 'admin') roleBadge.classList.add('role-admin');

            if (user.role === 'admin') {
                document.getElementById('adminToggleBtn').style.display = 'inline-block';
            } else {
                document.getElementById('selfDeleteBtn').style.display = 'inline-block';
            }

            loadAllFavorites();
        }
    } catch (error) {
        console.error("加载用户信息失败:", error);
    }
});


// 2. 切换管理员后台管理面板与用户个人收藏视图的显示状态
function toggleAdminView() {
    isAdminView = !isAdminView;
    const favView = document.getElementById('favoritesView');
    const adminView = document.getElementById('adminPanel');
    const toggleBtn = document.getElementById('adminToggleBtn');

    if (isAdminView) {
        favView.style.display = 'none';
        adminView.style.display = 'block';
        toggleBtn.innerText = '⬅ 返回我的收藏';
        toggleBtn.classList.replace('btn-primary', 'btn-outline');
        fetchUserList();
    } else {
        favView.style.display = 'block';
        adminView.style.display = 'none';
        toggleBtn.innerText = '⚙️ 系统管理';
        toggleBtn.classList.replace('btn-outline', 'btn-primary');
        loadAllFavorites();
    }
}


// 3. 触发获取并批量加载渲染所有收藏维度的内容数据
async function loadAllFavorites() {
    fetchFavoriteArtists();
    fetchFavoriteAlbums();
    fetchFavoriteTracks();
}


// 4. 异步获取并渲染当前登录用户收藏的艺人关注卡片列表
async function fetchFavoriteArtists() {
    const container = document.getElementById('favArtistsContainer');
    try {
        const res = await fetch('/api/my_favorite_artists');
        const data = await res.json();
        if (data.code === 200) {
            if (data.data.length === 0) {
                container.innerHTML = '<div class="empty-state">暂无关注的音乐人</div>';
                return;
            }
            container.innerHTML = data.data.map(artist => `
                <div class="fav-card">
                    <img src="${artist.image_url}" alt="${artist.name}" class="fav-card-img circle">
                    <div class="fav-card-title">${artist.name}</div>
                    <div class="fav-card-sub">🎧 ${artist.genres || 'Pop'}</div>
                </div>
            `).join('');
        }
    } catch (e) { console.error(e); }
}


// 5. 异步获取并渲染当前登录用户收藏的专辑卡片列表
async function fetchFavoriteAlbums() {
    const container = document.getElementById('favAlbumsContainer');
    try {
        const res = await fetch('/api/my_favorite_albums');
        const data = await res.json();
        if (data.code === 200) {
            if (data.data.length === 0) {
                container.innerHTML = '<div class="empty-state">暂无收藏的专辑</div>';
                return;
            }
            container.innerHTML = data.data.map(album => `
                <div class="fav-card">
                    <img src="${album.image_url}" alt="${album.name}" class="fav-card-img square">
                    <div class="fav-card-title" title="${album.name}">${album.name}</div>
                    <div class="fav-card-sub">${album.artist}</div>
                </div>
            `).join('');
        }
    } catch (e) { console.error(e); }
}


// 6. 异步获取并渲染当前登录用户喜欢的单曲横向文本行列表
async function fetchFavoriteTracks() {
    const container = document.getElementById('favTracksContainer');
    try {
        const res = await fetch('/api/my_favorite_tracks');
        const data = await res.json();
        if (data.code === 200) {
            if (data.data.length === 0) {
                container.innerHTML = '<div class="empty-state">暂无喜欢的单曲</div>';
                return;
            }
            container.innerHTML = data.data.map(track => {
                return `
                <div class="fav-track-row">
                    <div class="fav-track-info">
                        <div class="fav-track-name">${track.name}</div>
                        <div class="fav-track-artist">${track.artist} • ${track.album}</div>
                    </div>
                    <div class="fav-track-date">收藏于: ${track.favorited_at}</div>
                </div>
                `;
            }).join('');
        }
    } catch (e) { console.error(e); }
}


// 7. 处理用户主动退出登录请求
async function handleLogout() {
    if (!confirm("确定要退出登录吗？")) return;
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        const result = await response.json();
        if (result.code === 200) window.location.href = '/login';
    } catch (error) { alert("退出失败，请重试"); }
}


// 8. 处理普通用户主动注销并销毁自己账号的核心逻辑
async function handleSelfDelete() {
    if (!confirm("⚠️ 危险操作：账号注销后所有收藏数据将丢失！确定要注销吗？")) return;
    try {
        const response = await fetch(`/api/user/${currentUserId}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.code === 200) {
            alert("账号已成功注销。");
            window.location.href = '/login';
        } else { alert(result.msg); }
    } catch (error) { alert("操作失败，请重试"); }
}


// 9. 异步拉取全量用户列表数据并渲染后台管理表格体
async function fetchUserList() {
    try {
        const response = await fetch('/api/user/list');
        const result = await response.json();

        if (result.code === 200) {
            const tbody = document.getElementById('userTableBody');
            tbody.innerHTML = '';

            result.data.forEach(u => {
                const tr = document.createElement('tr');
                const actionHtml = u.id === currentUserId
                    ? `<span style="color:#1db954; font-size:12px; font-weight:bold;">当前在线</span>`
                    : `<button class="btn btn-outline btn-small btn-danger" onclick="deleteUserByAdmin(${u.id}, '${u.username}')">强制删除</button>`;

                tr.innerHTML = `
                    <td>#${u.id}</td>
                    <td style="font-weight: bold; color: #fff;">${u.username}</td>
                    <td><span style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; font-size: 12px;">${u.role}</span></td>
                    <td style="text-align: right;">${actionHtml}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) { console.error("获取用户列表失败:", error); }
}


// 10. 管理员强制执行级联删除指定用户账号及关联数据的管理逻辑
async function deleteUserByAdmin(userId, username) {
    if (!confirm(`确定要强制删除用户 [${username}] 吗？\n此操作会清空该用户的所有收藏记录！`)) return;
    try {
        const response = await fetch(`/api/user/${userId}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.code === 200) {
            fetchUserList();
        } else { alert(result.msg); }
    } catch (error) { alert("删除失败，请重试"); }
}