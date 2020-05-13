import Telegraf from "telegraf";
import Parser from 'rss-parser';
import { readFileSync } from 'fs';
import { DateTime } from 'luxon';
import fetch from 'node-fetch';
import * as htmlparser2 from 'htmlparser2';

function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return typeof value !== 'undefined' && value !== null;
}

interface IItem {
  time: DateTime;
  link: string;
  categories?: string[];
  title: string;
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
const zeitFakecookie = {
  headers: {
    'cookie': 'zonconsent=Tue Mar 31 3021 21:49:12 GMT+0200 (Central European Summer Time)'
  }
};

const processZeit = async (channel: IChannel, item: IItem) => {
  let send = true;
  let komplettAnsicht = false;
  let image = '';
  const parser = new htmlparser2.Parser({
    onopentag: (name: string, attr: any) => {
      if (attr['id'] === 'paywall') {
        console.log('paywall');
        send = false;
      }
      if (typeof attr['class'] === 'string') {
        if  (attr['class'].includes('article-toc')) {
        console.log('komplettAnsicht');
        komplettAnsicht = true;
        }
        if (attr['class'].includes('article__media-item') && typeof attr['src'] === 'string') {
          // image = attr['src'];
        }
      }
    }
  });
  parser.write(await (await fetch(item.link, zeitFakecookie)).text());
  if (!send) {
    return;
  }
  const link = komplettAnsicht ? item.link + '/komplettansicht' : item.link;
  const categories = item.categories ? item.categories?.reduce((old, current) => old + ', ' + current, '').substring(2) : '';
  const text = `*${item.title}*\n_${categories}_\n\n${link}`;
  if (image !== '') {
    bot.telegram.sendPhoto(channel.chatId, image, {
      caption: text,
      parse_mode: 'Markdown'
    });
    console.log(image);
  } else {
    bot.telegram.sendMessage(channel.chatId, text, { parse_mode: 'Markdown' });
  }
  // console.log(`*${item.title}*\n_${categories}_\n${link}`);
}

const processItem = async (channel: IChannel, item: IItem) => {
  const categories = item.categories ? item.categories?.reduce((old, current) => old + ', ' + current, '').substring(2) : '';
  bot.telegram.sendMessage(channel.chatId, `*${item.title}*\n_${categories}_\n\n${item.link}`, { parse_mode: 'Markdown' });
}

// processZeit(channels[0], {
//   time: DateTime.local(),
//   link: 'https://www.zeit.de/politik/deutschland/2020-03/werteunion-ralf-hoecker-staatsanwaltschaft-ermittlungen-eingestellt',
//   title: 'WerteUnion: Ermittlungen wegen Höcker-Rücktritt eingestellt',
//   categories: ['Deutschland']
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
      if (channel.rssUrl === 'http://newsfeed.zeit.de/index') {
        processZeit(channel, item);
      } else {
        processItem(channel, item);
      }
    }
    channel.sentItems = channel.sentItems.filter((item) => item.time.diffNow('hours').hours >= -300);
    channel.sentItems.unshift(...newItems);
  }
}, 5000);

bot.telegram.getMe().then(botInfo => {
  bot.options.username = botInfo.username;
});
bot.start((ctx) => ctx.reply(`last 300 hours: ${channels[0].sentItems?.length}`));
bot.launch();
