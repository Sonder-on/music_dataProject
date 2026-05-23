from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
import time

# 1. 你的本地驱动路径757
driver_path = r"../chromedriver.exe"

# 2. 设置用户数据保存路径 (你可以自己创建一个文件夹，例如在桌面)
# 注意：这个路径不能是现有的 Chrome 安装路径，必须是一个专门给脚本用的新文件夹
user_data_path = r"C:\Users\dxy\Desktop\SeleniumUserData"

options = Options()
# 关键步骤：指定用户数据目录
options.add_argument(f"--user-data-dir={user_data_path}")

# 可选：如果你想区分不同的账号，可以指定 profile-directory
# options.add_argument("--profile-directory=Default")

driver = webdriver.Chrome( options=options)

try:
    # 第一次运行：在这里手动登录 Spotify
    # 第二次及以后运行：它会自动识别登录状态
    url = "https://charts.spotify.com/charts/view/artist-global-weekly/latest"
    driver.get(url)

    print("浏览器已启动。如果是第一次，请手动完成登录。")
    print("登录成功后，直接关闭脚本即可，下次运行将保持状态。")

    # 给自己留出操作时间
    time.sleep(60)

finally:
    driver.quit()
