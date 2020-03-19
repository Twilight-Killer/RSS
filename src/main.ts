import delay from 'delay';
import Telegraf from "telegraf";
import Parser from 'rss-parser';
import { readFileSync } from 'fs';
import { DateTime, Duration } from 'luxon';
import fetch from 'node-fetch';
import * as htmlparser2 from 'htmlparser2';

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

const processItem = async (channel: IChannel, item: IItem) => {
  let send = item.link.indexOf('shop.zeit') !== -1;
  let komplettAnsicht = false;
  const parser = new htmlparser2.Parser({
    onopentag: (name: string, attr: any) => {
      if (attr['id'] === 'paywall') {
        console.log('paywall');
        send = false;
      }
      if (typeof attr['class'] === 'string' && attr['class'].includes('article-toc')) {
        console.log('komplettAnsicht');
        komplettAnsicht = true;
      }
    }
  });
  parser.write(await (await fetch(item.link)).text());
  if (!send) {
    return;
  }
  const link = komplettAnsicht ? item.link + '/komplettansicht' : item.link;
  bot.telegram.sendMessage(channel.chatId, `*${item.title}*\n\n${link}`, { parse_mode: 'Markdown' });
  // console.log(`*${item.title}*\n${link}`);
}

// processItem(channels[0], {
//   time: DateTime.local(),
//   link: 'https://www.zeit.de/arbeit/2020-02/schlafstoerungen-ingo-fietze-schlaf-yoga-cbd-schlafforschung/komplettansicht',
//   title: 'Test123'
// });



const bot = new Telegraf(process.env.BOT_TOKEN || '');
setInterval(async () => {
  // process.exit();
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
      processItem(channel, item);
    }
    channel.sentItems = channel.sentItems.filter((item) => item.time.diffNow('hours').hours >= -24);
    channel.sentItems.unshift(...newItems);
  }
}, 5000);

bot.telegram.getMe().then(botInfo => {
  bot.options.username = botInfo.username;
});
bot.start((ctx) => ctx.reply(`last 24 hours: ${channels[0].sentItems?.length}`));
bot.launch();
