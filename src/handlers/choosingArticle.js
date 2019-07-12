import gql from '../gql';
import {
  createPostbackAction,
  createFeedbackWords,
  createTypeWords,
  isNonsenseText,
  getArticleURL,
  ellipsis,
  ARTICLE_SOURCES,
} from './utils';
import ga from '../ga';

/**
 * 第2句 (template message)：按照時間排序「不在查證範圍」之外的回應，每則回應第一行是
 * 「⭕ 含有真實訊息」或「❌ 含有不實訊息」之類的 (含 emoticon)，然後是回應文字。如果
 * 還有空間，才放「不在查證範圍」的回應。最後一句的最後一格顯示「看其他回應」，連到網站。
 */
function reorderArticleReplies(articleReplies) {
  const replies = [];
  const notArticleReplies = [];

  for (let articleReply of articleReplies) {
    if (articleReply.reply.type !== 'NOT_ARTICLE') {
      replies.push(articleReply);
    } else {
      notArticleReplies.push(articleReply);
    }
  }
  return replies.concat(notArticleReplies);
}

// https://developers.line.me/en/docs/messaging-api/reference/#template-messages
function createAltText(articleReplies) {
  const eachLimit = 400 / articleReplies.length - 5;
  return articleReplies
    .slice(0, 10)
    .map(({ reply, positiveFeedbackCount, negativeFeedbackCount }, idx) => {
      const prefix = `Please send ${idx + 1}> ${createTypeWords(
        reply.type
      )}\n${createFeedbackWords(positiveFeedbackCount, negativeFeedbackCount)}`;
      const content = ellipsis(reply.text, eachLimit - prefix.length, '');
      return `${prefix}\n${content}`;
    })
    .join('\n\n');
}

export default async function choosingArticle(params) {
  let { data, state, event, issuedAt, userId, replies, isSkipUser } = params;

  if (!data.foundArticleIds) {
    throw new Error('foundArticleIds not set in data');
  }

  data.selectedArticleId = data.foundArticleIds[event.input - 1];
  const { selectedArticleId } = data;
  const doesNotContainMyArticle = +event.input === 0;

  if (doesNotContainMyArticle && isNonsenseText(data.searchedText)) {
    replies = [
      {
        type: 'text',
        text:
          'The amount of information you just sent was too small, and the editor could not verify it.。\n' +
          'Please refer to the 📖 manual for the scope of verification. http://bit.ly/cofacts-line-users',
      },
    ];
    state = '__INIT__';
  } else if (doesNotContainMyArticle) {
    data.articleSources = ARTICLE_SOURCES;
    const altText =
      'Ah, it seems that your message has not been included in our database. \n' +
      '\n' +
      'Where did you see this message from? \n' +
      '\n' +
      data.articleSources
        .map((option, index) => `${option} > 請傳 ${index + 1}\n`)
        .join('') +
      '\n' +
      'Please press the "⌨️" button in the lower left corner to enter the option number. ';

    replies = [
      {
        type: 'template',
        altText,
        template: {
          type: 'buttons',
          text:
            'Ah, it seems that your message has not been included in our database. \nWhere did you see this message from? ',
          actions: data.articleSources.map((option, index) =>
            createPostbackAction(option, index + 1, issuedAt)
          ),
        },
      },
    ];

    state = 'ASKING_ARTICLE_SOURCE';
  } else if (!selectedArticleId) {
    replies = [
      {
        type: 'text',
        text: `Please enter a number from  1～${data.foundArticleIds.length} to select the article.`,
      },
    ];

    state = 'CHOOSING_ARTICLE';
  } else {
    const {
      data: { GetArticle },
    } = await gql`
      query($id: String!) {
        GetArticle(id: $id) {
          text
          replyCount
          articleReplies(status: NORMAL) {
            reply {
              id
              type
              text
            }
            positiveFeedbackCount
            negativeFeedbackCount
          }
        }
      }
    `({
      id: selectedArticleId,
    });

    data.selectedArticleText = GetArticle.text;

    const visitor = ga(userId, state, data.selectedArticleText);

    // Track which Article is selected by user.
    visitor.event({
      ec: 'Article',
      ea: 'Selected',
      el: selectedArticleId,
    });

    const count = {};

    GetArticle.articleReplies.forEach(ar => {
      // Track which Reply is searched. And set tracking event as non-interactionHit.
      visitor.event({ ec: 'Reply', ea: 'Search', el: ar.reply.id, ni: true });

      const type = ar.reply.type;
      if (!count[type]) {
        count[type] = 1;
      } else {
        count[type]++;
      }
    });

    const articleReplies = reorderArticleReplies(GetArticle.articleReplies);
    const summary =
      'This message has：\n' +
      `${count.RUMOR || 0} Then the response is marked ❌ contains false information\n` +
      `${count.NOT_RUMOR || 0} Then the response is marked ⭕ contains the real message\n` +
      `${count.OPINIONATED || 0} Then the response is marked 💬 with personal opinion\n` +
      `${count.NOT_ARTICLE || 0} Then the response is marked ⚠️️ not in the scope of verification\n`;

    replies = [
      {
        type: 'text',
        text: summary,
      },
    ];

    if (articleReplies.length !== 0) {
      data.foundReplyIds = articleReplies.map(({ reply }) => reply.id);

      state = 'CHOOSING_REPLY';

      if (articleReplies.length === 1) {
        // choose for user
        event.input = 1;

        visitor.send();
        return {
          data,
          state: 'CHOOSING_REPLY',
          event,
          issuedAt,
          userId,
          replies,
          isSkipUser: true,
        };
      }

      replies.push({
        type: 'template',
        altText: createAltText(articleReplies),
        template: {
          type: 'carousel',
          columns: articleReplies
            .slice(0, 10)
            .map(
              (
                { reply, positiveFeedbackCount, negativeFeedbackCount },
                idx
              ) => ({
                text:
                  createTypeWords(reply.type) +
                  '\n' +
                  createFeedbackWords(
                    positiveFeedbackCount,
                    negativeFeedbackCount
                  ) +
                  '\n' +
                  ellipsis(reply.text, 80, ''),
                actions: [
                  createPostbackAction('Read this response ', idx + 1, issuedAt),
                ],
              })
            ),
        },
      });

      if (articleReplies.length > 10) {
        replies.push({
          type: 'text',
          text: `For more responses please go to: ${getArticleURL(selectedArticleId)}`,
        });
      }
    } else {
      // No one has replied to this yet.

      // Track not yet reply Articles.
      visitor.event({
        ec: 'Article',
        ea: 'NoReply',
        el: selectedArticleId,
      });

      data.articleSources = ARTICLE_SOURCES;
      const altText =
        'Sorry, no one has responded to this message yet! \n' +
        '\n' +
        'Where did you see this message from? \n' +
        '\n' +
        data.articleSources
          .map((option, index) => `${option} > Please send ${index + 1}\n`)
          .join('') +
        '\n' +
        'Please press the "⌨️" button in the lower left corner to enter the option number. ';

      replies = [
        {
          type: 'template',
          altText,
          template: {
            type: 'buttons',
            text:
              'Sorry, no one has responded to this message yet! \nWhere did you see this message from?',
            actions: data.articleSources.map((option, index) =>
              createPostbackAction(option, index + 1, issuedAt)
            ),
          },
        },
      ];

      state = 'ASKING_ARTICLE_SOURCE';
    }
    visitor.send();
  }

  return { data, state, event, issuedAt, userId, replies, isSkipUser };
}
