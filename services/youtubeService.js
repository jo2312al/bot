const Parser =
  require("rss-parser");

const parser =
  new Parser();

// ==========================================
// OBTENER VIDEOS YOUTUBE
// ==========================================

async function getYoutubeVideos() {

  const feedUrl =

    "https://www.youtube.com/feeds/videos.xml?channel_id=UCI0504BC1eMvR0dmkIdDrMg";

  const feed =
    await parser.parseURL(feedUrl);

  return feed.items.map(video => ({

    title:
      video.title,

    link:
      video.link

  }));

}

module.exports = {

  getYoutubeVideos

};