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
const zeitFakecookie = {
  headers: {
    'cookie': 'zonconsent=Tue Mar 31 3021 21:49:12 GMT+0200 (Central European Summer Time)'
  }
};

const escape = (str: string) => {
  return str.replace(/([_*\[\]()~`>#+-=|{}.!])/g, '\\$1')
}

const processZeit = async (channel: IChannel, item: IItem) => {
  let send = true;
  // const parser = new htmlparser2.Parser({
  //   onopentag: (name: string, attr: any) => {
  //     if (attr['id'] === 'paywall') {
  //       console.log('paywall');
  //       send = false;
  //     }
  //     if (typeof attr['class'] === 'string') {
  //       console.log(attr['class']);
  //       if (attr['class'].includes('article-toc')) {
  //         console.log('komplettAnsicht');
  //         komplettAnsicht = true;
  //       }
  //     }
  //   }
  // });
  // parser.write(await (await fetch(item.link, zeitFakecookie)).text());
  // console.log(await (await fetch(item.link, zeitFakecookie)).text());
  const komplettLink = item.link.replace(/\?/, '/komplettansicht?');

  let komplettAnsicht = (await fetch(komplettLink)).status !== 404;
  if (!send) {
    return;
  }
  const link = (komplettAnsicht ? komplettLink : item.link).replace(/([\)\\])/g, '\\$1');
  const categories = escape(item.categories ? item.categories?.reduce((old, current) => old + ', ' + current, '').substring(2) : '');
  if (categories.includes('News')) {
    console.log('news discarded');
    return;
  }
  const linkText = escape(item.description || 'Link');
  const text = `*${escape(item.title)}*\n_${categories}_\n\n[${linkText}](${link})`
  // console.log(text);
  bot.telegram.sendMessage(channel.chatId, text, { parse_mode: 'MarkdownV2' });
}

const processItem = async (channel: IChannel, item: IItem) => {
  const categories = item.categories ? item.categories?.reduce((old, current) => old + ', ' + current, '').substring(2) : '';
  bot.telegram.sendMessage(channel.chatId, `*${item.title}*\n_${categories}_\n\n${item.link}`, { parse_mode: 'Markdown' });
}

// setTimeout(() => {
//   processZeit(channels[0], {
//     time: DateTime.local(),
//     link: 'https://www.zeit.de/kultur/literatur/2020-09/lola-randl-die-krone-der-schoepfung-corona-roman?wt_zmc=fix.int.zonaudev.rss.zeitde.zeitde.feed.link.x&utm_medium=fix&utm_source=rss_zonaudev_int&utm_campaign=zeitde&utm_content=zeitde_feed_link_x&utm_referrer=rss',
//     title: 'Lola Randl: Zombie-Corona auf dem Lande',
//     categories: ['Literatur'],
//     description: 'Ein guter Roman zur virologischen Lage! Lola Randl schreibt in \"Die Krone der Schöpfung\" eine fröhlich hypochondrische Gegenwartsgeschichte über unsere neue Normalität.'
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
        if (channel.rssUrl === 'http://newsfeed.zeit.de/index') {
          processZeit(channel, item);
        } else {
          processItem(channel, item);
        }
      } catch { }
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
