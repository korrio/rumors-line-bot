import gql from '../gql';
import { getArticleURL, REASON_PREFIX, createArticleShareReply } from './utils';

export default async function askingArticleSubmission(params) {
  let { data, state, event, issuedAt, userId, replies, isSkipUser } = params;
  const { selectedArticleId } = data;

  if (!event.input.startsWith(REASON_PREFIX)) {
    replies = [
      {
        type: 'text',
        text: 'Please click on "I want to know" above, or give up this and change other messages.',
      },
    ];
  } else {
    const reason = event.input.slice(REASON_PREFIX.length);

    const {
      data: { CreateReplyRequest },
    } = await gql`
      mutation($id: String!, $reason: String) {
        CreateReplyRequest(articleId: $id, reason: $reason) {
          replyRequestCount
        }
      }
    `({ id: selectedArticleId, reason }, { userId });

    const articleUrl = getArticleURL(selectedArticleId);

    replies = [
      {
        type: 'text',
        text: `Your enquiries have been recorded, a total of ${
          CreateReplyRequest.replyRequestCount
        } People are as eager to see a response to this message as you are. If there is an up-to-date response, it will be written in this place: ${articleUrl}`,
      },
      createArticleShareReply(articleUrl, reason),
    ];
    state = '__INIT__';
  }

  return { data, state, event, issuedAt, userId, replies, isSkipUser };
}
