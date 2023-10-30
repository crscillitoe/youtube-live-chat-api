const {
  getAllEvents,
  listenMessages,
} = require('./youtubeMessages');

let listening = false;

async function listenChat() {
  if (listening) {
    return {
      listening: true,
    };
  }
  const liveEvent = (await getAllEvents())
    .find((event) => event.liveStreamingDetails.concurrentViewers);
  if (liveEvent) {
    listening = true;
    const {
      snippet: {
        liveChatId,
      },
    } = liveEvent;
    const listener = listenMessages(liveChatId);
    listener.on('messages', async (newMessages) => {
      newMessages = newMessages.sort((a, b) => a.publishedAt - b.publishedAt);
      // Messages Processing Here TODO

    });
    listener.on('event-end', (data) => {
      listening = false;
    });
    return {
      listening: true,
    };
  }
  return {
    listening: false,
  };
}

function notFound(req, res, next) {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.status = 404;
  next(error);
}

// eslint-disable-next-line
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  res.status(status);
  res.json({
    status,
    message: err.message,
  });
}
