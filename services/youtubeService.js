function createParser() {

  try {

    const Parser =
      require("rss-parser");

    return new Parser();

  } catch (error) {

    if (
      error.code === "MODULE_NOT_FOUND"
    ) {

      throw new Error(
        "Falta instalar rss-parser. Ejecuta npm install antes de usar turismo."
      );

    }

    throw error;

  }

}

// ==========================================
// OBTENER VIDEOS YOUTUBE
// ==========================================

async function getYoutubeVideos() {

  const parser =
    createParser();

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
