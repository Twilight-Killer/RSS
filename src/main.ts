import delay from 'delay';
import Telegraf from "telegraf";
import Parser from 'rss-parser';
import { readFileSync } from 'fs';
import { DateTime, Duration } from 'luxon';


interface IItem {
  time: DateTime;
  link?: string;
  title?: string;
}
const mapItem = (rssItem: Parser.Item): IItem => {
  return {
    time: DateTime.local(),
    link: rssItem.link,
    title: rssItem.title
  }
}
interface IChannel {
  chatId: string | number;
  rssUrl: string;
  sentItems: IItem[] | undefined;
}

const channels: IChannel[] = JSON.parse(readFileSync('channels.json').toString());

const bot = new Telegraf('process.env.BOT_TOKEN');
setInterval(async () => {
  for (const channel of channels) {
    const feed = await new Parser().parseURL(channel.rssUrl);
    if (channel.sentItems === undefined) { // first rss download after start
      console.log('first');
      channel.sentItems = feed.items?.map(mapItem);
      return;
    }
    if (!channel.sentItems || !feed.items) {
      return;
    }
    const newItems = feed.items.filter(feedItem => !channel.sentItems?.find(channelItem => channelItem.link === feedItem.link)).map(mapItem);
    console.log(`${DateTime.local()} new: ` + newItems.map(i => i.link + ', ') || 'none');
    for (const item of newItems) {
      bot.telegram.sendMessage(channel.chatId, `${item.title}\n${item.link}`);
    }
    channel.sentItems = channel.sentItems.filter((item) => item.time.diffNow('hours').hours <= 24);
    channel.sentItems.push(... newItems);
  }
}, 5000);

bot.telegram.getMe().then(botInfo => {
  bot.options.username = botInfo.username;
});
bot.start((ctx) => ctx.reply(`last 24 hours: ${channels.length}`));
bot.launch();
