import ga from '../ga';
import gql from '../gql';
import { REASON_PREFIX, getArticleURL, createArticleShareReply } from './utils';

export default async function askingArticleSubmission(params) {
  let { data, state, event, issuedAt, userId, replies, isSkipUser } = params;

  const visitor = ga(userId, state, data.searchedText);

  if (!event.input.startsWith(REASON_PREFIX)) {
    replies = [
      {
        type: 'text',
        text:
          'Please click on the "Send button" above to send the current message to the database or transfer other messages.',
      },
    ];
  } else {
    visitor.event({ ec: 'Article', ea: 'Create', el: 'Yes' });

    const reason = event.input.slice(REASON_PREFIX.length);
    const {
      data: { CreateArticle },
    } = await gql`
      mutation($text: String!, $reason: String!) {
        CreateArticle(text: $text, reason: $reason, reference: { type: LINE }) {
          id
        }
      }
    `({ text: data.searchedText, reason }, { userId });

    const articleUrl = getArticleURL(CreateArticle.id);

    replies = [
      {
        type: 'text',
        text: `The message you have returned has been included to: ${articleUrl}`,
      },
      createArticleShareReply(articleUrl, reason),
    ];
    state = '__INIT__';
  }

  visitor.send();
  return { data, state, event, issuedAt, userId, replies, isSkipUser };
}
