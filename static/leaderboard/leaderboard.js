let trendChart, pieChart, radarChart, mapChart;
let realTimeInterval;
let trendDataX = [];
let trendDataPlay = [];
let trendDataSearch = [];


// 1. 页面加载初始化，设置默认结转日期并绑定下拉框联动事件
document.addEventListener('DOMContentLoaded', () => {
    const dateSelect = document.getElementById('dateSelect');
    const regionSelect = document.getElementById('regionSelect');

    const today = new Date();
    today.setDate(today.getDate() - 2);
    const defaultDate = today.toISOString().split('T')[0];

    if (dateSelect) {
        dateSelect.value = defaultDate;
    }

    fetchLeaderboardData('Global', defaultDate);
    fetchTopArtistsData('Global', defaultDate);

    if (regionSelect) regionSelect.addEventListener('change', triggerFetch);
    if (dateSelect) dateSelect.addEventListener('change', triggerFetch);
});


// 2. 触发榜单抓取联动，顺序请求后端单曲与艺人数据并更新界面状态
async function triggerFetch() {
    const regionSelect = document.getElementById('regionSelect');
    const dateSelect = document.getElementById('dateSelect');
    if (!regionSelect || !dateSelect) return;

    const region = regionSelect.value;
    const date = dateSelect.value;
    const regionName = regionSelect.options[regionSelect.selectedIndex].text.split(' ')[0];

    const artistLabel = document.getElementById('artistRegionLabel');
    if (artistLabel) artistLabel.innerText = `${regionName} | ${date}`;

    const artistContainer = document.getElementById('topArtistsContainer');
    if (artistContainer) {
        artistContainer.innerHTML = `
            <div style="text-align: center; padding: 40px 0; color: #b3b3b3; animation: fadeIn 0.3s ease-out;">
                <div class="loading-spinner" style="margin-bottom: 15px; font-size: 20px;">🎤</div>
                <div style="font-size: 13px;">正在排队等待抓取艺人数据...</div>
            </div>
        `;
    }

    try {
        await fetchLeaderboardData(region, date);
        await new Promise(resolve => setTimeout(resolve, 500));
        await fetchTopArtistsData(region, date);
    } catch (err) {
        console.error("抓取任务排队冲突:", err);
    }
}


// 3. 异步获取并渲染指定地区与日期的单曲排行榜数据
async function fetchLeaderboardData(region, date) {
    const container = document.getElementById('trackListContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align: center; padding: 100px 0; color: #b3b3b3;">
            <div class="loading-spinner" style="margin-bottom: 20px;">🎶</div>
            <div>正在同步 Spotify ${region} 实时榜单...</div>
        </div>
    `;

    try {
        const response = await fetch(`/api/leaderboard_data?region=${encodeURIComponent(region)}&date=${date}`);
        const result = await response.json();

        if (result.code === 200) {
            let tracks = result.data.tracks || [];
            container.innerHTML = '';

            tracks.forEach((track, index) => {
                const rank = track.Rank || (index + 1);
                const title = track.title || 'Unknown Title';
                const artist = track.artist || 'Unknown Artist';
                const cover = track.cover_url || '';

                const rowHtml = `
                    <div class="list-row" style="display: grid; grid-template-columns: 60px 4fr 1fr 1fr 1fr 1.5fr; gap: 10px; align-items: center; padding: 12px 10px; cursor: pointer; transition: background 0.2s;"
                         onclick="window.location.href='/track?q=${encodeURIComponent(title + ' ' + artist)}'"
                         onmouseover="this.style.background='rgba(255,255,255,0.08)'"
                         onmouseout="this.style.background='transparent'">
                        
                        <div style="font-weight: 500; color: #b3b3b3; padding-left: 20px;">${rank}</div>
                        <div style="display: flex; align-items: center; gap: 16px; overflow: hidden;">
                            <img src="${cover || '/static/images/default_cover.png'}" style="width: 42px; height: 42px; border-radius: 4px; object-fit: cover;">
                            <div style="display: flex; flex-direction: column; overflow: hidden;">
                                <span style="font-weight: 600; color: #fff; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${title}</span>
                                <span style="font-size: 12px; color: #a7a7a7;">${artist}</span>
                            </div>
                        </div>
                        <div style="text-align: right; color: #888;">${track.Peak || '-'}</div>
                        <div style="text-align: right; color: #888;">${track.Prev || '-'}</div>
                        <div style="text-align: right; color: #888;">${track.Streak || '-'}</div>
                        <div style="text-align: right; color: #b3b3b3; font-size: 13px;">${track.Streams || '-'}</div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', rowHtml);
            });
        } else {
            container.innerHTML = `<div style="text-align: center; padding: 60px; color: #ff4d4d;">❌ 加载失败: ${result.msg}</div>`;
        }
    } catch (error) {
        container.innerHTML = `<div style="text-align: center; padding: 60px; color: #ff4d4d;">❌ 网络请求异常</div>`;
    }
}


// 4. 异步获取并渲染指定地区与日期的热门艺人排行榜数据
async function fetchTopArtistsData(region, date) {
    const container = document.getElementById('topArtistsContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align: center; padding: 40px 0; color: #b3b3b3; animation: fadeIn 0.3s ease-out;">
            <div class="loading-spinner" style="margin-bottom: 15px; font-size: 20px;">🎤</div>
            <div style="font-size: 13px;">正在同步艺人热度数据...</div>
        </div>
    `;

    try {
        const response = await fetch(`/api/top_artists_data?region=${encodeURIComponent(region)}&date=${date}`);
        const result = await response.json();

        if (result.code === 200) {
            const artists = result.data.artists || [];
            container.innerHTML = '';

            if (artists.length === 0) {
                container.innerHTML = `<div style="text-align: center; padding: 40px 0; color: #666;">该地区/日期暂无数据</div>`;
                return;
            }

            artists.forEach((artist, index) => {
                const rank = index + 1;
                const rankColor = rank <= 3 ? '#1ed760' : '#888';

                const rowHtml = `
                    <div style="display: flex; align-items: center; gap: 15px; padding: 8px 10px; border-radius: 6px; transition: background 0.2s; cursor: pointer;"
                         onclick="window.location.href='/artists?q=${encodeURIComponent(artist.name)}'"
                         onmouseover="this.style.background='rgba(255,255,255,0.08)'"
                         onmouseout="this.style.background='transparent'">
                        
                        <div style="width: 20px; text-align: center; font-weight: bold; color: ${rankColor};">${rank}</div>
                        <img src="${artist.avatar || '/static/images/default_artist.png'}" style="width: 32px; height: 32px; border-radius: 50%; background: #333; object-fit: cover;">
                        <div style="flex: 1; overflow: hidden; display: flex; align-items: center;">
                            <div style="color: #fff; font-size: 14px; font-weight: 500; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${artist.name}</div>
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', rowHtml);
            });
        } else {
            container.innerHTML = `<div style="text-align: center; padding: 40px 0; color: #ff4d4d; font-size: 13px;">❌ ${result.msg}</div>`;
        }
    } catch (error) {
        container.innerHTML = `<div style="text-align: center; padding: 40px 0; color: #ff4d4d; font-size: 13px;">❌ 网络异常</div>`;
    }
}