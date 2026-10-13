function defaultLinkTemplate({ slug, permalink, alias }) {
  return {
    hName: 'a',
    hProperties: { href: permalink == null ? slug : permalink },
    hChildren: [{ type: 'text', value: alias == null ? slug : alias }],
  };
}
export function fromMarkdown(opts = {}) {
  const linkTemplate = opts.linkTemplate || defaultLinkTemplate;
  let node;
  function enterWikiLink(token) {
    node = {
      type: 'wikiLink',
      value: null,
      data: {
        // alias: null,
        // permalink: null
      },
    };
    // @ts-expect-error
    this.enter(node, token);
  }
  function top(stack) {
    return stack[stack.length - 1];
  }
  function exitWikiLinkAlias(token) {
    const alias = this.sliceSerialize(token);
    const current = top(this.stack);
    // @ts-expect-error
    current.data.alias = alias;
  }
  function exitWikiLinkTarget(token) {
    const target = this.sliceSerialize(token);
    const current = top(this.stack);
    // @ts-expect-error
    current.value = target;
  }
  function exitWikiLink(token) {
    this.exit(token);
    const wikiLink = node;
    const data = {
      slug: wikiLink.value,
      alias: wikiLink.data.alias,
      permalink: opts.linkResolver ? opts.linkResolver(wikiLink.value) : undefined,
    };
    wikiLink.data = {
      // ...wikiLink.data,
      alias: data.alias,
      permalink: data.permalink,
      ...linkTemplate(data),
    };
  }
  return {
    enter: {
      wikiLink: enterWikiLink,
    },
    exit: {
      wikiLinkTarget: exitWikiLinkTarget,
      wikiLinkAlias: exitWikiLinkAlias,
      wikiLink: exitWikiLink,
    },
  };
}
