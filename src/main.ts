import Telegraf from "telegraf";
import Parser from 'rss-parser';
import { readFileSync } from 'fs';
import { DateTime } from 'luxon';

function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return typeof value !== 'undefined' && value !== null;
}

interface IItem {
  time: DateTime;
  link: string;
  categories?: string[];
  title: string;
  description?: string;
}
const mapItem = (rssItem: Parser.Item): IItem | undefined => {
  if (rssItem.link && rssItem.title) {
    return {
      time: DateTime.local(),
      link: rssItem.link,
      categories: rssItem.categories,
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

const escape = (str: string) => {
  return str.replace(/([_*\[\]()~`>#+-=|{}.!])/g, '\\$1')
}

const processItem = async (channel: IChannel, item: IItem) => {
  const link = item.link.replace(/\?.*/, '');
  const categories = escape(item.categories ? item.categories?.reduce((old, current) => old + ', ' + current, '').substring(2) : '');
  if (categories.includes('News') || categories.includes('zett')) {
    console.log('news discarded');
    return;
  }
  const text = `*${escape(item.title)}*\n_${categories}_\n\n${escape(link)}`;
  bot.telegram.sendMessage(channel.chatId, text, { parse_mode: 'MarkdownV2' });
}

// setTimeout(() => {
//   processItem(channels[2], {
//     time: DateTime.local(),
//     link: 'https://www.tagesspiegel.de/politik/nach-klagen-von-afd-und-npd-verfassungsgericht-kippt-paritaetsgesetz-in-brandenburg/26302076.html',
//     title: 'Verfassungsgericht kippt Paritätsgesetz in Brandenburg',
//     categories: ['Politik'],
//     description: 'Das Brandenburger Verfassungsgericht hat das Paritätsgesetz zu den Kandidatenlisten der Parteien für Landtagswahlen nichtig erklärt.'
//   });
// }, 2000);

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
      try {
        processItem(channel, item);
      } catch { }
    }
    channel.sentItems = channel.sentItems.filter((item) => item.time.diffNow('hours').hours >= -300);
    channel.sentItems.unshift(...newItems);
  }
}, 5000);

bot.telegram.getMe().then(botInfo => {
  bot.options.username = botInfo.username;
});
bot.start((ctx) => ctx.reply(`last 300 hours: ${channels.map(c => c.sentItems?.length ?? 0).reduce((a, b) => a + b)}`));
bot.launch();
