// The DOM of @xufa/html (lib/dom): trees parsed as browsers parse them, and read and changed as the DOM standard says:
// the live NodeIterator (its reference moved when nodes are removed), attributes (names checked, lowercased on HTML
// elements, namespaces), innerHTML and outerHTML (templates, foreign content, scripting disabled), cloning and
// importing, XML (parsed, serialized, errors), selectors, classList, and the names of document and forms browsers have.
// (DOMPurify's tests on it are in packages/purify.)
import { createWindow, DOMParser, NodeFilter, Element, HTMLTemplateElement, DOMException } from '../dom.js';

const parseHtml = (html) => new DOMParser().parseFromString(html, 'text/html');

describe('the DOM of @xufa/html', () => {
  it('parses as browsers do: implied elements, misnested tags, tables, foreign content, noscript with scripting off', () => {
    const document = parseHtml('<p>a<b>b<i>c</p>d</i>e<table>x<td>y<svg><foreignObject><p>z</svg><noscript><b>n</b></noscript>');
    // (As Chrome has it: </svg> inside the <p> of a foreignObject is ignored, so the noscript is in the <p>.)
    expect(document.documentElement.outerHTML).toBe(
      '<html><head></head><body><p>a<b>b<i>c</i></b></p><b><i>d</i>e' +
        'x<table><tbody><tr><td>y<svg><foreignObject><p>z<noscript><b>n</b></noscript></p></foreignObject></svg>' +
        '</td></tr></tbody></table></b></body></html>'
    );
    const svg = document.querySelector('svg');
    expect([svg.namespaceURI, svg.nodeName, svg.firstChild.nodeName, svg.firstChild.localName]).toEqual([
      'http://www.w3.org/2000/svg',
      'svg',
      'foreignObject',
      'foreignObject',
    ]);
    expect(document.querySelector('p').nodeName).toBe('P');
  });

  it('a NodeIterator is live: an element replaced by its children while it walks, the walk goes through them', () => {
    const document = parseHtml('<div><b>1<i>2</i></b><u>3</u></div>');
    const iterator = document.createNodeIterator(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    const seen = [];
    for (let node = iterator.nextNode(); node; node = iterator.nextNode()) {
      seen.push(node.nodeName === '#text' ? node.data : node.nodeName);
      if (node.nodeName === 'B') {
        for (const child of [...node.childNodes].reverse()) node.parentNode.insertBefore(child.cloneNode(true), node.nextSibling);
        node.remove();
      }
    }
    expect(seen).toEqual(['BODY', 'DIV', 'B', '1', 'I', '2', 'U', '3']);
    expect(document.body.innerHTML).toBe('<div>1<i>2</i><u>3</u></div>');
    // (Removing the reference with the pointer before it: the next node after it.)
    const list = parseHtml('<ul><li>a</li><li>b</li><li>c</li></ul>');
    const walker = list.createNodeIterator(list.body, NodeFilter.SHOW_ELEMENT);
    walker.nextNode();
    walker.nextNode();
    const [first, second] = list.querySelectorAll('li');
    expect(walker.nextNode()).toBe(first);
    expect(walker.previousNode()).toBe(first);
    first.remove();
    expect(walker.referenceNode).toBe(second);
    expect(walker.nextNode()).toBe(second);
    // (A document that lives long holds its 32 most recent iterators, not every one made on it.)
    for (let i = 0; i < 100; i += 1) list.createNodeIterator(list.body);
    expect(list._iterators.size).toBe(32);
  });

  it('attributes: names checked as the DOM standard has them (no white space, NUL, /, = or >), lowercased on HTML elements, namespaced ones by namespace', () => {
    const document = parseHtml('<a HREF="x" data-Y="1"></a><svg viewBox="0 0 1 1"><use xlink:href="#a"/></svg>');
    const a = document.querySelector('a');
    expect([a.getAttribute('href'), a.getAttribute('HREF'), a.attributes[1].name]).toEqual(['x', 'x', 'data-y']);
    a.setAttribute('Title', 't');
    expect(a.getAttributeNames()).toEqual(['href', 'data-y', 'title']);
    expect(() => a.setAttribute('a=b', 'x')).toThrow(DOMException);
    expect(() => a.setAttribute('a b', 'x')).toThrow(expect.objectContaining({ name: 'InvalidCharacterError', code: 5 }));
    a.setAttribute('a"b', 'x');
    expect(a.getAttribute('a"b')).toBe('x');
    const svg = document.querySelector('svg');
    expect([svg.getAttribute('viewBox'), svg.getAttribute('viewbox')]).toEqual(['0 0 1 1', null]);
    const use = document.querySelector('use');
    const href = use.attributes[0];
    expect([href.name, href.localName, href.prefix, href.namespaceURI]).toEqual([
      'xlink:href',
      'href',
      'xlink',
      'http://www.w3.org/1999/xlink',
    ]);
    expect(use.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#a');
    use.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
    expect(use.attributes.length).toBe(0);
    expect(() => a.setAttributeNS(null, 'x:y', '1')).toThrow(expect.objectContaining({ name: 'NamespaceError' }));
  });

  it('innerHTML and outerHTML: parsed in the context of the element, templates in their content', () => {
    const { document } = createWindow();
    const table = document.createElement('table');
    table.innerHTML = '<tr><td>1';
    expect(table.outerHTML).toBe('<table><tbody><tr><td>1</td></tr></tbody></table>');
    const template = document.createElement('template');
    template.innerHTML = '<b>x</b><script>alert(1)</script>';
    expect(template instanceof HTMLTemplateElement).toBe(true);
    expect([template.childNodes.length, template.content.childNodes.length]).toEqual([0, 2]);
    expect(template.content.ownerDocument).not.toBe(document);
    expect(template.innerHTML).toBe('<b>x</b><script>alert(1)</script>');
    expect(template.cloneNode(true).innerHTML).toBe(template.innerHTML);
    const div = document.createElement('div');
    div.innerHTML = '<p>a &amp; &lt;b&gt;</p><!-- c --><style>a < b</style>';
    expect(div.innerHTML).toBe('<p>a &amp; &lt;b&gt;</p><!-- c --><style>a < b</style>');
    expect(div.textContent).toBe('a & <b>a < b');
    div.textContent = '<x>';
    expect(div.innerHTML).toBe('&lt;x&gt;');
  });

  it('nodes moved between documents: importNode and adoptNode, cloneNode deep or not', () => {
    const one = parseHtml('<div id="d"><span class="s">x</span></div>');
    const two = createWindow().document;
    const div = one.getElementById('d');
    const copy = two.importNode(div, true);
    expect([copy.ownerDocument === two, copy.firstChild.ownerDocument === two, copy.outerHTML]).toEqual([
      true,
      true,
      '<div id="d"><span class="s">x</span></div>',
    ]);
    expect(div.cloneNode(false).outerHTML).toBe('<div id="d"></div>');
    two.body.appendChild(div);
    expect([div.ownerDocument === two, one.getElementById('d')]).toEqual([true, null]);
    expect(() => two.body.appendChild(two.body.parentNode)).toThrow(expect.objectContaining({ name: 'HierarchyRequestError' }));
  });

  it('XML: namespaces, CDATA, processing instructions; a <parsererror> for what is not well formed', () => {
    const parser = new DOMParser();
    const xml = parser.parseFromString(
      '<?xml version="1.0"?><root xmlns="urn:r" xmlns:a="urn:a"><a:x a:k="v" k="&lt;"><![CDATA[<z>]]></a:x><?pi data?><e/></root>',
      'application/xml'
    );
    const x = xml.documentElement.firstChild;
    expect([x.namespaceURI, x.localName, x.prefix, x.tagName, x.attributes[0].namespaceURI]).toEqual([
      'urn:a',
      'x',
      'a',
      'a:x',
      'urn:a',
    ]);
    expect(xml.documentElement.outerHTML).toBe(
      '<root xmlns="urn:r" xmlns:a="urn:a"><a:x a:k="v" k="&lt;"><![CDATA[<z>]]></a:x><?pi data?><e/></root>'
    );
    for (const broken of ['<a><b></a>', '<a x="1" x="2"/>', '<a>&nope;</a>', '<p:a/>', '']) {
      expect(parser.parseFromString(broken, 'application/xml').documentElement.localName).toBe('parsererror');
    }
    const xhtml = parser.parseFromString('<html xmlns="http://www.w3.org/1999/xhtml"><body><br/><p/></body></html>', 'application/xhtml+xml');
    expect(xhtml.body.innerHTML).toBe('<br xmlns="http://www.w3.org/1999/xhtml" /><p xmlns="http://www.w3.org/1999/xhtml"></p>');
    expect(() => {
      xhtml.body.innerHTML = '<p>';
    }).toThrow(expect.objectContaining({ name: 'SyntaxError' }));
  });

  it('selectors, classList, and the children of a node', () => {
    const document = parseHtml(
      '<ul id="l"><li class="a b">1</li><li class="b" data-x="yes">2</li><li>3</li></ul><p lang="en-GB">p</p>'
    );
    const text = (list) => [...list].map((element) => element.textContent);
    expect(text(document.querySelectorAll('#l > li.b'))).toEqual(['1', '2']);
    expect(text(document.querySelectorAll('li:not(.a)'))).toEqual(['2', '3']);
    expect(text(document.querySelectorAll('li[data-x="yes"], p[lang|="en"]'))).toEqual(['2', 'p']);
    expect(text(document.querySelectorAll('li + li ~ li, li:first-child'))).toEqual(['1', '3']);
    expect(() => document.querySelector('li::before')).toThrow(expect.objectContaining({ name: 'SyntaxError' }));
    const li = document.querySelector('li');
    li.classList.add('c');
    li.classList.remove('a');
    expect([li.className, li.classList.contains('b'), li.classList.toggle('b'), li.className]).toEqual([
      'b c',
      true,
      false,
      'c',
    ]);
    expect(li.closest('ul').id).toBe('l');
    expect([document.getElementById('l').children.length, document.body.childElementCount]).toEqual([3, 2]);
  });

  it('has the names of the properties of document and forms that browsers have (a sanitizer checks ids against them)', () => {
    const { document } = createWindow();
    for (const name of ['cookie', 'location', 'activeElement', 'body', 'createElement']) expect(name in document).toBe(true);
    const form = document.createElement('form');
    for (const name of ['submit', 'acceptCharset', 'elements', 'action']) expect(name in form).toBe(true);
    expect('nothingLikeThis' in document).toBe(false);
    expect(form instanceof Element).toBe(true);
  });
});
