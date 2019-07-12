import stringSimilarity from 'string-similarity';
import gql from '../gql';
import {
  createPostbackAction,
  isNonsenseText,
  ellipsis,
  ARTICLE_SOURCES,
} from './utils';
import ga from '../ga';

const SIMILARITY_THRESHOLD = 0.95;

export default async function initState(params) {
  let { data, state, event, issuedAt, userId, replies, isSkipUser } = params;

  // Track text message type send by user
  const visitor = ga(userId, state, event.input);
  visitor.event({ ec: 'UserInput', ea: 'MessageType', el: 'text' });

  // Store user input into context
  data.searchedText = event.input;

  // Search for articles
  const {
    data: { ListArticles },
  } = await gql`
    query($text: String!) {
      ListArticles(
        filter: { moreLikeThis: { like: $text } }
        orderBy: [{ _score: DESC }]
        first: 4
      ) {
        edges {
          node {
            text
            id
          }
        }
      }
    }
  `({
    text: event.input,
  });

  const articleSummary = ellipsis(event.input, 12);

  if (ListArticles.edges.length) {
    // Track if find similar Articles in DB.
    visitor.event({ ec: 'UserInput', ea: 'ArticleSearch', el: 'ArticleFound' });

    // Track which Article is searched. And set tracking event as non-interactionHit.
    ListArticles.edges.forEach(edge => {
      visitor.event({
        ec: 'Article',
        ea: 'Search',
        el: edge.node.id,
        ni: true,
      });
    });

    const edgesSortedWithSimilarity = ListArticles.edges
      .map(edge => {
        edge.similarity = stringSimilarity.compareTwoStrings(
          // Remove spaces so that we count word's similarities only
          //
          edge.node.text.replace(/\s/g, ''),
          event.input.replace(/\s/g, '')
        );
        return edge;
      })
      .sort((edge1, edge2) => edge2.similarity - edge1.similarity);

    // Store article ids
    data.foundArticleIds = edgesSortedWithSimilarity.map(
      ({ node: { id } }) => id
    );

    const hasIdenticalDocs =
      edgesSortedWithSimilarity[0].similarity >= SIMILARITY_THRESHOLD;

    if (edgesSortedWithSimilarity.length === 1 && hasIdenticalDocs) {
      // choose for user
      event.input = 1;

      visitor.send();
      return {
        data,
        state: 'CHOOSING_ARTICLE',
        event,
        issuedAt,
        userId,
        replies,
        isSkipUser: true,
      };
    }

    const templateMessage = {
      type: 'template',
      altText: edgesSortedWithSimilarity
        .map(
          ({ node: { text } }, idx) =>
            `Please choose to play ${idx + 1}> ${ellipsis(text, 20, '')}`
        )
        .concat(hasIdenticalDocs ? [] : ['If none of the above, please enter "0"。'])
        .join('\n\n'),
      template: {
        type: 'carousel',
        columns: edgesSortedWithSimilarity
          .map(({ node: { text }, similarity }, idx) => ({
            text: `[Similarity:${(similarity * 100).toFixed(2) +
              '%'}] \n ${ellipsis(text, 100, '')}`,
            actions: [createPostbackAction('Choose this', idx + 1, issuedAt)],
          }))
          .concat(
            hasIdenticalDocs
              ? []
              : [
                  {
                    text: 'No one here is a message from me. ',
                    actions: [createPostbackAction('Select', 0, issuedAt)],
                  },
                ]
          ),
      },
    };

    replies = [
      {
        type: 'text',
        text: `Help you inquire「${articleSummary}」related response。`,
      },
      {
        type: 'text',
        text: 'Which of the following articles is the message you just sent? ',
      },
      templateMessage,
    ];
    state = 'CHOOSING_ARTICLE';
  } else {
    if (isNonsenseText(event.input)) {
      // Track if find similar Articles in DB.
      visitor.event({
        ec: 'UserInput',
        ea: 'ArticleSearch',
        el: 'NonsenseText',
      });

      replies = [
        {
          type: 'text',
          text:
            'The information you have sent is too small to search the database for you! \n' +
            'For correct use, please refer to the 📖 manual http://bit.ly/cofacts-line-users',
        },
      ];
      state = '__INIT__';
    } else {
      // Track if find similar Articles in DB.
      visitor.event({
        ec: 'UserInput',
        ea: 'ArticleSearch',
        el: 'ArticleNotFound',
      });

      data.articleSources = ARTICLE_SOURCES;
      const altText =
        `Can't find message about \n` +
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
            text: `Can't find out about「${articleSummary}」\n Where did you see this message from?`,
            actions: data.articleSources.map((option, index) =>
              createPostbackAction(option, index + 1, issuedAt)
            ),
          },
        },
      ];
      state = 'ASKING_ARTICLE_SOURCE';
    }
  }
  visitor.send();
  return { data, state, event, issuedAt, userId, replies, isSkipUser };
}
