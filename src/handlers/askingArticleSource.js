import {
  REASON_PREFIX,
  getLIFFURL,
  createAskArticleSubmissionReply,
  ellipsis,
} from './utils';
import ga from '../ga';

export default async function askingArticleSource(params) {
  let { data, state, event, issuedAt, userId, replies, isSkipUser } = params;

  const source = data.articleSources[event.input - 1];
  if (!source) {
    replies = [
      {
        type: 'text',
        text: `Please enter a number from 1～${data.articleSources.length} to select the source.`,
      },
    ];
    state = 'ASKING_ARTICLE_SOURCE';
    return { data, state, event, issuedAt, userId, replies, isSkipUser };
  }

  const visitor = ga(userId, state, data.selectedArticleText);
  // Track the source of the new message.
  visitor.event({ ec: 'Article', ea: 'ProvidingSource', el: source });
  if (source === '自己輸入的') {
    replies = [
      {
        type: 'template',
        altText:
          'Ok, I suggest you pass the message to MyGoPen or rum toast. Both are very professional rumors and you have a 💁 someone to answer your questions!',
        template: {
          type: 'confirm',
          text:
            'Ok, I suggest you pass the message to MyGoPen or rum toast. Both are very professional rumors and you have a 💁 someone to answer your questions!',
          actions: [
            {
              type: 'uri',
              label: 'MyGoPen',
              uri: `line://ti/p/%40mygopen`,
            },
            {
              type: 'uri',
              label: '蘭姆酒吐司',
              uri: `line://ti/p/1q14ZZ8yjb`,
            },
          ],
        },
      },
    ];

    state = '__INIT__';
  } else if (
    data.foundArticleIds &&
    data.foundArticleIds.length > 0 &&
    data.selectedArticleId
  ) {
    // articles that are already reported
    const altText =
      '[Talk to the editor about your doubts] \n' +
      'Ok, thank you. If you think this is a rumor, please point out that you have doubts and persuade the editor that this is a message that should be blamed. \n' +
      '\n' +
      'Please click on the "⌨️" button in the lower left corner to send us the reason why "what you think is a rumor" to help the editors to clarify your doubts;\n' +
      'If you want to skip, please enter "n"。';

    replies = [
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
                text: 'Tell your doubts with the editor',
                weight: 'bold',
                color: '#009900',
                size: 'sm',
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
                  'Ok, thank you. If you want to be ignorant, you can follow this one, please click "I want to know" to tell everyone your thoughts.',
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
                  label: '🙋 Oh, I want to know too.',
                  uri: getLIFFURL(
                    'ASKING_REPLY_REQUEST_REASON',
                    data.searchedText,
                    REASON_PREFIX,
                    issuedAt
                  ),
                },
              },
            ],
          },
        },
      },
    ];

    state = 'ASKING_REPLY_REQUEST_REASON';
  } else {
    // brand new articles
    replies = [
      {
        type: 'text',
        text: 'Ok, thank you.',
      },
    ].concat(
      createAskArticleSubmissionReply(
        'ASKING_ARTICLE_SUBMISSION_REASON',
        ellipsis(data.searchedText, 12),
        REASON_PREFIX,
        issuedAt
      )
    );
    state = 'ASKING_ARTICLE_SUBMISSION_REASON';
  }
  visitor.send();
  return { data, state, event, issuedAt, userId, replies, isSkipUser };
}
