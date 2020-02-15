import delay from 'delay';
import Telegraf from "telegraf";
import Parser from 'rss-parser';
import { readFileSync } from 'fs';

interface IChannel {
  chatId: string | number;
  rssUrl: string;
  rssItems: Parser.Item[] | undefined;
}

const channels: IChannel[] = JSON.parse(readFileSync('channels.json').toString());

const bot = new Telegraf('process.env.BOT_TOKEN');
setInterval(async () => {
  for (const channel of channels) {
    const feed = await new Parser().parseURL(channel.rssUrl);
    if (channel.rssItems === undefined) { // first rss download after start
      console.log('first');
      channel.rssItems = feed.items;
      return;
    }
    if (!channel.rssItems || !feed.items) {
      return;
    }
    // console.log(feed.items.find((feedItem) => feedItem.guid === (channel.rssItems as any)[0].guid)?.link + '\n' + (channel.rssItems as any)[0].link);
    const newItems = channel.rssItems.filter(item => !feed.items?.find((feedItem) => feedItem.link === item.link));
    console.log(`${Date.now()} - diff: ${newItems.length}`)
    for (const item of newItems) {
      bot.telegram.sendMessage(channel.chatId, `${item.title}\n${item.link}`);
    }
    channel.rssItems = feed.items;
  }

}, 5000);

bot.telegram.getMe().then(botInfo => {
  bot.options.username = botInfo.username;
});
bot.start((ctx) => ctx.reply('Hello!'));

bot.start((ctx) => ctx.reply('Hi'));

// bot.telegram.sendMessage('@zeitonlinerss', 'Hello World!');
bot.launch();
