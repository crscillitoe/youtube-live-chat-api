const EventEmitter = require('events');
const axios = require('axios');

require('dotenv').config();

const {
  YOUTUBE_CHANNEL_ID: channelId,
  GOOGLE_API_KEY: key,
} = process.env;


const liveChatUrl = 'https://www.googleapis.com/youtube/v3/liveChat/messages';

async function getEvents(eventType) {
  const params = new URLSearchParams({
    part: 'snippet',
    channelId,
    key,
    type: 'video',
    eventType,
  });

  const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
  const {
    data,
  } = await axios.get(url);
  return data;
}

async function getAllEvents() {
  const [liveEvents, upcomingEvents] = await Promise.all([
    getEvents('live'),
    getEvents('upcoming'),
  ]);

  const events = [].concat(liveEvents.items || [], upcomingEvents.items || []);

  if (events.length) {
    const liveStreams = await Promise.all(
      events.map(async (video) => {
        const videoParams = new URLSearchParams({
          part: 'liveStreamingDetails',
          id: video.id.videoId,
          key,
        });
        const videoUrl = `https://www.googleapis.com/youtube/v3/videos?${videoParams}`;
        const {
          data,
        } = await axios.get(videoUrl);
        // eslint-disable-next-line
        video.snippet.liveChatId = data.items[0].liveStreamingDetails.activeLiveChatId;
        return {
          ...video,
          ...video.id,
          ...data.items[0],
        };
      }),
    );
    return liveStreams;
  }
  return [];
}

function listenMessages(liveChatId) {
  const emitter = new EventEmitter();

  const getMessages = async () => {
    let nextPageToken = '';

    const params = new URLSearchParams({
      liveChatId,
      part: 'snippet,authorDetails',
      maxResults: 2000,
      key,
    });

    do {
      let url = `${liveChatUrl}?${params}`;
      if (nextPageToken) {
        url += `&pageToken=${nextPageToken}`;
      }

      try {
        const { data: result } = await axios.get(url);

        if (result.items && result.items.length > 0) {
          const newMessages = result.items.map((item) => {
            const {
              id: message_id,
              snippet,
              authorDetails,
            } = item;

            const message = {
              message_id,
              liveChatId,
              message: snippet.displayMessage,
              publishedAt: new Date(snippet.publishedAt),
              channelId: authorDetails.channelId,
              author: authorDetails,
            };

            if (snippet.type === 'superChatEvent') {
              message.superChat = snippet.superChatDetails;
            }

            return message;
          });

          if (newMessages.length > 0) {
            newMessages.sort((a, b) => +new Date(a.publishedAt) - +new Date(b.publishedAt));
            emitter.emit('messages', newMessages);
          }
        }
        nextPageToken = result.nextPageToken;

        await new Promise((resolve) => {
          setTimeout(resolve, result.pollingIntervalMillis);
        });
      } catch (error) {
        if (error.response && error.response.data && error.response.data.message === 'The live chat is no longer live.') {
          nextPageToken = '';
          emitter.emit('event-end', {
            liveChatId,
          });
        } else if (nextPageToken) {
          await new Promise((resolve) => {
            setTimeout(resolve, 5000);
          });
        }
      }
    } while (nextPageToken);
  };

  getMessages();

  return emitter;
}

module.exports = {
  getAllEvents,
  listenMessages,
};
