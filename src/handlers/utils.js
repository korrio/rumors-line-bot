import GraphemeSplitter from 'grapheme-splitter';
const splitter = new GraphemeSplitter();

export function createPostbackAction(label, input, issuedAt) {
  return {
    type: 'postback',
    label,
    data: JSON.stringify({
      input,
      issuedAt,
    }),
  };
}

/**
 * @param {number} positive - Count of positive feedbacks
 * @param {number} negative - Count of negative feedbacks
 * @return {string} Description of feedback counts
 */
export function createFeedbackWords(positive, negative) {
  if (positive + negative === 0) return '[No one has yet commented on this response]';
  let result = '';
  if (positive) result += `There are ${positive} People think this response is helpful\n`;
  if (negative) result += `There are ${negative} People think this response didn't help\n`;
  return `[${result.trim()}]`;
}

/**
 * @param {string} text - The text to show in flex message, text type
 * @return {string} The truncated text
 */
export function createFlexMessageText(text = '') {
  // Actually the upper limit is 2000, but 100 should be enough
  // because we only show the first line
  return ellipsis(text, 100, '');
}

export function createTypeWords(type) {
  switch (type) {
    case 'RUMOR':
      return 'Contains false information';
    case 'NOT_RUMOR':
      return 'Contains real information';
    case 'OPINIONATED':
      return 'Contains personal opinions';
    case 'NOT_ARTICLE':
      return 'Not in the scope of verification';
  }
  return 'The status of the response is undefined!';
}

/**
 * @param {object} reply The reply object
 * @param {string} reply.reference
 * @param {string} reply.type
 * @returns {string} The reference message to send
 */
export function createReferenceWords({ reference, type }) {
  const prompt = type === 'OPINIONATED' ? 'See different views' : 'Source';

  if (reference) return `${prompt}：${reference}`;
  return `\uDBC0\uDC85 ⚠️️ This response is not ${prompt}，Please consider the credibility of the response at your own discretion. ⚠️️  \uDBC0\uDC85`;
}

/**
 * prefilled text for reasons
 */
export const REASON_PREFIX = '💁 My reason is: \n';
export const DOWNVOTE_PREFIX = '💡 I feel that the response did not help and can be improved like this: \n';

/**
 * @param {string} state The current state
 * @param {string} text The prompt text
 * @param {string} prefix The prefix to use in the result text
 * @param {number} issuedAt The issuedAt that created this URL
 * @returns {string}
 */
export function getLIFFURL(state, text, prefix, issuedAt) {
  return `${process.env.LIFF_URL}?state=${state}&text=${encodeURIComponent(
    ellipsis(text, 10)
  )}&prefix=${encodeURIComponent(prefix)}&issuedAt=${issuedAt}`;
}

/**
 * @param {string} state The current state
 * @param {string} text The prompt text
 * @param {string} prefix The prefix to use in the result text
 * @param {string} issuedAt The current issuedAt
 * @returns {array} an array of reply message instances
 */
export function createAskArticleSubmissionReply(state, text, prefix, issuedAt) {
  const altText =
    '【Send a message to the public database? 】\n' +
    'If this is「Forward message」，And you think this is probably a「rumor」，Please send this message to the public database for documentation, so that the good people can verify and reply.\n' +
    '\n' +
    'Although you will not receive the verification results immediately, you can help those who also receive this message in the future.\n' +
    '\n' +
    '📱 Please complete the operation on your 智慧 smartphone.';

  return [
    {
      type: 'flex',
      altText,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: '🥇 Be the first person in the world to return this message',
              weight: 'bold',
              color: '#009900',
            },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            {
              type: 'text',
              text:
                'There is currently no message in your database. If this is a "forwarded message" and you think it is likely to be a "rumor"，',
              wrap: true,
            },
            {
              type: 'text',
              text: 'Please click "🆕 to enter the database" to open this message and let the good people check and reply.',
              color: '#009900',
              wrap: true,
            },
            {
              type: 'text',
              text:
                'Although you will not receive the verification results immediately, you can help those who also receive this message in the future.',
              wrap: true,
            },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'primary',
              action: {
                type: 'uri',
                label: '🆕 Feed into the database',
                uri: getLIFFURL(state, text, prefix, issuedAt),
              },
            },
          ],
        },
        styles: {
          body: {
            separator: true,
          },
        },
      },
    },
  ];
}

export function isNonsenseText(/* text */) {
  // return text.length < 20;
  return false; // according to 20181017 meeting note, we remove limitation and observe
}

/**
 * @param {string} text
 * @param {number} limit
 * @return {string} if the text length is lower than limit, return text; else, return
 *                  text with ellipsis.
 */
export function ellipsis(text, limit, ellipsis = '⋯⋯') {
  if (splitter.countGraphemes(text) < limit) return text;

  return (
    splitter
      .splitGraphemes(text)
      .slice(0, limit - ellipsis.length)
      .join('') + ellipsis
  );
}

const SITE_URL = process.env.SITE_URL || 'https://cofacts.g0v.tw';

/**
 * @param {string} articleId
 * @returns {string} The article's full URL
 */
export function getArticleURL(articleId) {
  return `${SITE_URL}/article/${articleId}`;
}

/**
 * @param {string} articleUrl
 * @param {string} reason
 * @returns {object} Reply object with sharing buttings
 */
export function createArticleShareReply(articleUrl, reason) {
  return {
    type: 'template',
    altText:
      'Far away relatives are not as good as neighbors. Asking relatives and friends is always right. Share the message to your friends, maybe someone can help you!',
    template: {
      type: 'buttons',
      actions: [
        {
          type: 'uri',
          label: 'LINE 群組',
          uri: `line://msg/text/?${encodeURIComponent(
            `The idea I received this message is: \n${ellipsis(
              reason,
              70
            )}\n\nPlease help me see if this is true or not：${articleUrl}`
          )}`,
        },
        {
          type: 'uri',
          label: 'Facebook',
          uri: `https://www.facebook.com/dialog/share?openExternalBrowser=1&app_id=${
            process.env.FACEBOOK_APP_ID
          }&display=popup&quote=${encodeURIComponent(
            ellipsis(reason, 80)
          )}&hashtag=${encodeURIComponent(
            '#ชัวร์ก่อนแชร์'
          )}&href=${encodeURIComponent(articleUrl)}`,
        },
      ],
      title: 'A distant relative is not as good as a neighbor, and it’s always right to ask relatives and friends.',
      text: 'Maybe there are people in your friends who can solve your problems! \nWho do you want Call-out?',
    },
  };
}

/**
 * possible sources of incoming articles
 */
export const ARTICLE_SOURCES = [
  'Relatives pass',
  'Colleagues pass',
  'Friend transfer',
  'Input by yourself',
];
