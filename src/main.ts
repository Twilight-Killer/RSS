import delay from 'delay';
import Telegraf from "telegraf";
import Parser from 'rss-parser';
import { readFileSync } from 'fs';
import { DateTime, Duration } from 'luxon';

function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return typeof value !== 'undefined' && value !== null;
}

interface IItem {
  time: DateTime;
  link: string;
  title: string;
}
const mapItem = (rssItem: Parser.Item): IItem | undefined => {
  if (rssItem.link && rssItem.title) {
    return {
      time: DateTime.local(),
      link: rssItem.link,
      title: rssItem.title
    }
  }
  return undefined;
}
interface IChannel {
  chatId: string | number;
  rssUrl: string;
  sentItems: IItem[] | undefined;
}

const channels: IChannel[] = JSON.parse(readFileSync('channels.json').toString());

const bot = new Telegraf(process.env.BOT_TOKEN || '');
setInterval(async () => {
  for (const channel of channels) {
    const feed = await new Parser().parseURL(channel.rssUrl);
    if (channel.sentItems === undefined) { // first rss download after start
      console.log(`${DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss')}: first`);
      channel.sentItems = feed.items?.map(mapItem).filter(notEmpty);
      return;
    }
    if (!channel.sentItems || !feed.items) {
      return;
    }
    const newItems: IItem[] = feed.items.filter(feedItem => !channel.sentItems?.find(channelItem => channelItem.link === feedItem.link)).map(mapItem).filter(notEmpty);
    if (newItems.length > 0) {
      console.log(`${DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss')} new: ` + newItems.map(i => i.link + ', ') || 'none');
    }
    for (const item of newItems) {
      const site = await (await fetch(item.link)).text();
      const match = site.match(/id\s*=\s*"paywall"/); // don't send links with a paywall
      if (match === null) {
        bot.telegram.sendMessage(channel.chatId, `*${item.title}*\n${item.link}`, {parse_mode: 'Markdown'});
      }
    }
    channel.sentItems = channel.sentItems.filter((item) => item.time.diffNow('hours').hours <= 24);
    channel.sentItems.push(...newItems);
  }
}, 5000);

bot.telegram.getMe().then(botInfo => {
  bot.options.username = botInfo.username;
});
bot.start((ctx) => ctx.reply(`last 24 hours: ${channels[0].sentItems?.length}`));
bot.launch();
