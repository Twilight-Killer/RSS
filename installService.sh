#/bin/bash
sudo ln -s $(pwd)/rssbot.service /etc/systemd/system/rssbot.service
sudo systemctl daemon-reload
sudo systemctl enable rssbot
sudo systemctl start rssbot
