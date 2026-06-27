'use strict';

var obsidian = require('obsidian');
var state = require('@codemirror/state');
var view = require('@codemirror/view');

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

class Settings {
    constructor() {
        // Defaults as in Vimium extension for browsers
        this.letters = 'sadfjklewcmpgh';
        this.jumpToAnywhereRegex = '\\b\\w{3,}\\b';
        this.lightspeedCaseSensitive = false;
        this.jumpToLinkIfOneLinkOnly = true;
        this.lightspeedJumpToStartOfWord = true;
        this.lightspeedCharacterCount = 2;
    }
}

class MarkWidget extends view.WidgetType {
    constructor(mark, type, matchedEventKey) {
        super();
        this.mark = mark;
        this.type = type;
        this.matchedEventKey = matchedEventKey;
    }
    eq(other) {
        return other.mark === this.mark && other.matchedEventKey == this.matchedEventKey;
    }
    toDOM() {
        const mark = activeDocument.createElement("span");
        mark.innerText = this.mark;
        const wrapper = activeDocument.createElement("div");
        wrapper.style.display = "inline-block";
        wrapper.style.position = "absolute";
        wrapper.classList.add('jl');
        wrapper.classList.add('jl-' + this.type);
        wrapper.classList.add('popover');
        if (this.matchedEventKey && this.mark.toUpperCase().startsWith(this.matchedEventKey.toUpperCase())) {
            wrapper.classList.add('matched');
        }
        wrapper.append(mark);
        return wrapper;
    }
    ignoreEvent() {
        return false;
    }
}

class MarkPlugin {
    constructor(_view) {
        this.links = [];
        this.matchedEventKey = undefined;
        this.links = [];
        this.matchedEventKey = undefined;
        this.decorations = view.Decoration.none;
    }
    setLinks(links) {
        this.links = links;
        this.matchedEventKey = undefined;
    }
    clean() {
        this.links = [];
        this.matchedEventKey = undefined;
    }
    filterWithEventKey(eventKey) {
        if (eventKey.length != 1)
            return;
        this.links = this.links.filter(v => {
            return v.letter.length == 2 && v.letter[0].toUpperCase() == eventKey.toUpperCase();
        });
        this.matchedEventKey = eventKey;
    }
    get visible() {
        return this.links.length > 0;
    }
    update(_update) {
        const widgets = this.links.map((x) => view.Decoration.widget({
            widget: new MarkWidget(x.letter, x.type, this.matchedEventKey),
            side: 1,
        }).range(x.index));
        this.decorations = view.Decoration.set(widgets);
    }
}

/**
 * Get only visible content
 * @param cmEditor
 * @returns Letter offset and visible content as a string
 */
function getVisibleLineText(cmEditor) {
    const scrollInfo = cmEditor.getScrollInfo();
    const { line: from } = cmEditor.coordsChar({ left: 0, top: 0 }, 'page');
    const { line: to } = cmEditor.coordsChar({ left: scrollInfo.left, top: scrollInfo.top + scrollInfo.height });
    const indOffset = cmEditor.indexFromPos({ ch: 0, line: from });
    const strs = cmEditor.getRange({ ch: 0, line: from }, { ch: 0, line: to + 1 });
    return { indOffset, strs };
}
/**
 *
 * @param alphabet - Letters which used to produce hints
 * @param numLinkHints - Count of needed links
 */
function getLinkHintLetters(alphabet, numLinkHints) {
    const alphabetUppercase = alphabet.toUpperCase();
    let prefixCount = Math.ceil((numLinkHints - alphabetUppercase.length) / (alphabetUppercase.length - 1));
    // ensure 0 <= prefixCount <= alphabet.length
    prefixCount = Math.max(prefixCount, 0);
    prefixCount = Math.min(prefixCount, alphabetUppercase.length);
    const prefixes = ['', ...Array.from(alphabetUppercase.slice(0, prefixCount))];
    const linkHintLetters = [];
    for (let i = 0; i < prefixes.length; i++) {
        const prefix = prefixes[i];
        for (let j = 0; j < alphabetUppercase.length; j++) {
            if (linkHintLetters.length < numLinkHints) {
                const letter = alphabetUppercase[j];
                if (prefix === '') {
                    if (!prefixes.contains(letter)) {
                        linkHintLetters.push(letter);
                    }
                }
                else {
                    linkHintLetters.push(prefix + letter);
                }
            }
            else {
                break;
            }
        }
    }
    return linkHintLetters;
}
function getMDHintLinks(content, offset, letters) {
    var _a;
    // expecting either [[Link]] or [[Link|Title]]
    const regExInternal = /\[\[(.+?)(\|.+?)?]]/g;
    // expecting [Title](../example.md)
    const regExMdInternal = /\[[^\[\]]+?\]\(((\.\.|\w|\d).+?)\)/g;
    // expecting [Title](file://link), [Title](https://link) or any other [Jira-123](jira://bla-bla) link
    const regExExternal = /\[[^\[\]]+?\]\((.+?:\/\/.+?)\)/g;
    // expecting http://hogehoge or https://hogehoge
    const regExUrl = /( |\n|^)(https?:\/\/[^ \n]+)/g;
    let indexes = new Set();
    let linksWithIndex = [];
    let regExResult;
    const addLinkToArray = (link) => {
        if (indexes.has(link.index))
            return;
        indexes.add(link.index);
        linksWithIndex.push(link);
    };
    while (regExResult = regExInternal.exec(content)) {
        const linkText = (_a = regExResult[1]) === null || _a === void 0 ? void 0 : _a.trim();
        addLinkToArray({ index: regExResult.index + offset, type: 'internal', linkText });
    }
    // External Link above internal, to prefer type external over interal in case of a dupe
    while (regExResult = regExExternal.exec(content)) {
        const linkText = regExResult[1];
        addLinkToArray({ index: regExResult.index + offset, type: 'external', linkText });
    }
    while (regExResult = regExMdInternal.exec(content)) {
        const linkText = regExResult[1];
        addLinkToArray({ index: regExResult.index + offset, type: 'internal', linkText });
    }
    while (regExResult = regExUrl.exec(content)) {
        const linkText = regExResult[2];
        addLinkToArray({ index: regExResult.index + offset + 1, type: 'external', linkText });
    }
    const linkHintLetters = getLinkHintLetters(letters, linksWithIndex.length);
    const linksWithLetter = [];
    linksWithIndex
        .sort((x, y) => x.index - y.index)
        .forEach((linkHint, i) => {
        linksWithLetter.push(Object.assign({ letter: linkHintLetters[i] }, linkHint));
    });
    return linksWithLetter.filter(link => link.letter);
}
function createWidgetElement(content, type) {
    const linkHintEl = activeDocument.createElement('div');
    linkHintEl.classList.add('jl');
    linkHintEl.classList.add('jl-' + type);
    linkHintEl.classList.add('popover');
    linkHintEl.innerHTML = content;
    return linkHintEl;
}
function displaySourcePopovers(cmEditor, linkKeyMap) {
    const drawWidget = (cmEditor, linkHint) => {
        const pos = cmEditor.posFromIndex(linkHint.index);
        // the fourth parameter is undocumented. it specifies where the widget should be place
        return cmEditor.addWidget(pos, createWidgetElement(linkHint.letter, linkHint.type), false, 'over');
    };
    linkKeyMap.forEach(x => drawWidget(cmEditor, x));
}

class CM6LinkProcessor {
    constructor(editor, alphabet) {
        this.getSourceLinkHints = () => {
            const { letters } = this;
            const { index, content } = this.getVisibleLines();
            return getMDHintLinks(content, index, letters);
        };
        this.cmEditor = editor;
        this.letters = alphabet;
    }
    init() {
        return this.getSourceLinkHints();
    }
    getVisibleLines() {
        var _a, _b, _c;
        const { cmEditor } = this;
        let { from, to } = cmEditor.viewport;
        // For CM6 get real visible lines top
        // @ts-ignore
        if ((_b = (_a = cmEditor.viewState) === null || _a === void 0 ? void 0 : _a.pixelViewport) === null || _b === void 0 ? void 0 : _b.top) {
            // @ts-ignore
            const pixelOffsetTop = cmEditor.viewState.pixelViewport.top;
            // @ts-ignore
            const lines = cmEditor.viewState.viewportLines;
            // @ts-ignore
            from = (_c = lines.filter(line => line.top > pixelOffsetTop)[0]) === null || _c === void 0 ? void 0 : _c.from;
        }
        const content = cmEditor.state.sliceDoc(from, to);
        return { index: from, content };
    }
}

function extractRegexpBlocks(content, offset, regexp, letters, caseSensitive) {
    const regExUrl = caseSensitive ? new RegExp(regexp, 'g') : new RegExp(regexp, 'ig');
    let linksWithIndex = [];
    let regExResult;
    while ((regExResult = regExUrl.exec(content))) {
        const linkText = regExResult[1];
        linksWithIndex.push({
            index: regExResult.index + offset,
            type: "regex",
            linkText,
        });
    }
    const linkHintLetters = getLinkHintLetters(letters, linksWithIndex.length);
    const linksWithLetter = [];
    linksWithIndex
        .sort((x, y) => x.index - y.index)
        .forEach((linkHint, i) => {
        linksWithLetter.push(Object.assign({ letter: linkHintLetters[i] }, linkHint));
    });
    return linksWithLetter.filter(link => link.letter);
}

class CM6RegexProcessor extends CM6LinkProcessor {
    constructor(editor, alphabet, regexp, caseSensitive) {
        super(editor, alphabet);
        this.regexp = regexp;
        this.caseSensitive = caseSensitive;
    }
    init() {
        const { letters, regexp } = this;
        const { index, content } = this.getVisibleLines();
        return extractRegexpBlocks(content, index, regexp, letters, this.caseSensitive);
    }
}

class LegacyRegexpProcessor {
    constructor(cmEditor, regexp, alphabet, caseSensitive) {
        this.cmEditor = cmEditor;
        this.regexp = regexp;
        this.letters = alphabet;
        this.caseSensitive = caseSensitive;
    }
    init() {
        const [content, offset] = this.getVisibleContent();
        const links = this.getLinks(content, offset);
        this.display(links);
        return links;
    }
    getVisibleContent() {
        const { cmEditor } = this;
        const { indOffset, strs } = getVisibleLineText(cmEditor);
        return [strs, indOffset];
    }
    getLinks(content, offset) {
        const { regexp, letters } = this;
        return extractRegexpBlocks(content, offset, regexp, letters, this.caseSensitive);
    }
    display(links) {
        const { cmEditor } = this;
        displaySourcePopovers(cmEditor, links);
    }
}

class LegacySourceLinkProcessor {
    constructor(editor, alphabet) {
        this.getSourceLinkHints = (cmEditor) => {
            const { letters } = this;
            const { indOffset, strs } = getVisibleLineText(cmEditor);
            return getMDHintLinks(strs, indOffset, letters);
        };
        this.cmEditor = editor;
        this.letters = alphabet;
    }
    init() {
        const { cmEditor } = this;
        const linkHints = this.getSourceLinkHints(cmEditor);
        displaySourcePopovers(cmEditor, linkHints);
        return linkHints;
    }
}

function getPreviewLinkHints(previewViewEl, letters) {
    const anchorEls = previewViewEl.querySelectorAll('a, .metadata-link-inner');
    const embedEls = previewViewEl.querySelectorAll('.internal-embed');
    const linkHints = [];
    anchorEls.forEach((anchorEl, _i) => {
        var _a;
        if (checkIsPreviewElOnScreen(previewViewEl, anchorEl)) {
            return;
        }
        const linkType = anchorEl.classList.contains('internal-link')
            ? 'internal'
            : 'external';
        const linkText = linkType === 'internal'
            ? (_a = anchorEl.dataset['href']) !== null && _a !== void 0 ? _a : anchorEl.href
            : anchorEl.href;
        let offsetParent = anchorEl.offsetParent;
        let top = anchorEl.offsetTop;
        let left = anchorEl.offsetLeft;
        while (offsetParent) {
            if (offsetParent == previewViewEl) {
                offsetParent = undefined;
            }
            else {
                top += offsetParent.offsetTop;
                left += offsetParent.offsetLeft;
                offsetParent = offsetParent.offsetParent;
            }
        }
        linkHints.push({
            linkElement: anchorEl,
            letter: '',
            linkText: linkText,
            type: linkType,
            top: top,
            left: left,
        });
    });
    embedEls.forEach((embedEl, _i) => {
        const linkText = embedEl.getAttribute('src');
        const linkEl = embedEl.querySelector('.markdown-embed-link');
        if (linkText && linkEl) {
            if (checkIsPreviewElOnScreen(previewViewEl, linkEl)) {
                return;
            }
            let offsetParent = linkEl.offsetParent;
            let top = linkEl.offsetTop;
            let left = linkEl.offsetLeft;
            while (offsetParent) {
                if (offsetParent == previewViewEl) {
                    offsetParent = undefined;
                }
                else {
                    top += offsetParent.offsetTop;
                    left += offsetParent.offsetLeft;
                    offsetParent = offsetParent.offsetParent;
                }
            }
            linkHints.push({
                linkElement: linkEl,
                letter: '',
                linkText: linkText,
                type: 'internal',
                top: top,
                left: left,
            });
        }
    });
    const sortedLinkHints = linkHints.sort((a, b) => {
        if (a.top > b.top) {
            return 1;
        }
        else if (a.top === b.top) {
            if (a.left > b.left) {
                return 1;
            }
            else if (a.left === b.left) {
                return 0;
            }
            else {
                return -1;
            }
        }
        else {
            return -1;
        }
    });
    const linkHintLetters = getLinkHintLetters(letters, sortedLinkHints.length);
    sortedLinkHints.forEach((linkHint, i) => {
        linkHint.letter = linkHintLetters[i];
    });
    return sortedLinkHints;
}
function checkIsPreviewElOnScreen(parent, el) {
    el = el.closest('[data-view-type="table"], table') || el;
    return el.offsetTop < parent.scrollTop || el.offsetTop > parent.scrollTop + parent.offsetHeight;
}
function displayPreviewPopovers(linkHints) {
    const linkHintHtmlElements = [];
    for (let linkHint of linkHints) {
        const popoverElement = linkHint.linkElement.createEl('span');
        linkHint.linkElement.style.position = 'relative';
        popoverElement.style.top = '0px';
        popoverElement.style.left = '0px';
        popoverElement.textContent = linkHint.letter;
        popoverElement.classList.add('jl');
        popoverElement.classList.add('jl-' + linkHint.type);
        popoverElement.classList.add('popover');
        linkHintHtmlElements.push(popoverElement);
    }
    return linkHintHtmlElements;
}

class PreviewLinkProcessor {
    constructor(view, alphabet) {
        this.view = view;
        this.alphabet = alphabet;
    }
    init() {
        const { view, alphabet } = this;
        const links = getPreviewLinkHints(view, alphabet);
        displayPreviewPopovers(links);
        return links;
    }
}

class LivePreviewLinkProcessor {
    constructor(view, editor, alphabet) {
        this.getSourceLinkHints = () => {
            const { alphabet } = this;
            const { index, content } = this.getVisibleLines();
            return getMDHintLinks(content, index, alphabet);
        };
        this.view = view;
        this.cmEditor = editor;
        this.alphabet = alphabet;
    }
    init() {
        const { view, alphabet } = this;
        const links = getPreviewLinkHints(view, alphabet);
        const sourceLinks = this.getSourceLinkHints();
        const linkHintLetters = getLinkHintLetters(alphabet, links.length + sourceLinks.length);
        const linksRemapped = links.map((link, idx) => (Object.assign(Object.assign({}, link), { letter: linkHintLetters[idx] }))).filter(link => link.letter);
        const sourceLinksRemapped = sourceLinks.map((link, idx) => (Object.assign(Object.assign({}, link), { letter: linkHintLetters[idx + links.length] }))).filter(link => link.letter);
        const linkHintHtmlElements = displayPreviewPopovers(linksRemapped);
        return [linksRemapped, sourceLinksRemapped, linkHintHtmlElements];
    }
    getVisibleLines() {
        var _a, _b, _c;
        const { cmEditor } = this;
        let { from, to } = cmEditor.viewport;
        // For CM6 get real visible lines top
        // @ts-ignore
        if ((_b = (_a = cmEditor.viewState) === null || _a === void 0 ? void 0 : _a.pixelViewport) === null || _b === void 0 ? void 0 : _b.top) {
            // @ts-ignore
            const pixelOffsetTop = cmEditor.viewState.pixelViewport.top;
            // @ts-ignore
            const lines = cmEditor.viewState.viewportLines;
            // @ts-ignore
            from = (_c = lines.filter(line => line.top > pixelOffsetTop)[0]) === null || _c === void 0 ? void 0 : _c.from;
        }
        const content = cmEditor.state.sliceDoc(from, to);
        return { index: from, content };
    }
}

var VIEW_MODE;
(function (VIEW_MODE) {
    VIEW_MODE[VIEW_MODE["SOURCE"] = 0] = "SOURCE";
    VIEW_MODE[VIEW_MODE["PREVIEW"] = 1] = "PREVIEW";
    VIEW_MODE[VIEW_MODE["LEGACY"] = 2] = "LEGACY";
    VIEW_MODE[VIEW_MODE["LIVE_PREVIEW"] = 3] = "LIVE_PREVIEW";
})(VIEW_MODE || (VIEW_MODE = {}));
class JumpToLink extends obsidian.Plugin {
    constructor() {
        super(...arguments);
        this.isLinkHintActive = false;
        this.prefixInfo = undefined;
        this.currentCursor = {};
        this.cursorBeforeJump = {};
        this.handleJumpToLink = () => {
            const { settings: { letters } } = this;
            const { mode, currentView } = this;
            switch (mode) {
                case VIEW_MODE.LEGACY: {
                    const cmEditor = this.cmEditor;
                    const sourceLinkHints = new LegacySourceLinkProcessor(cmEditor, letters).init();
                    this.handleActions(sourceLinkHints);
                    break;
                }
                case VIEW_MODE.LIVE_PREVIEW: {
                    const cm6Editor = this.cmEditor;
                    const previewViewEl = currentView.currentMode.editor.containerEl;
                    const [previewLinkHints, sourceLinkHints, linkHintHtmlElements] = new LivePreviewLinkProcessor(previewViewEl, cm6Editor, letters).init();
                    cm6Editor.plugin(this.markViewPlugin).setLinks(sourceLinkHints);
                    this.app.workspace.updateOptions();
                    this.handleActions([...previewLinkHints, ...sourceLinkHints], linkHintHtmlElements);
                    break;
                }
                case VIEW_MODE.PREVIEW: {
                    const previewViewEl = currentView.previewMode.containerEl.querySelector('div.markdown-preview-view');
                    const previewLinkHints = new PreviewLinkProcessor(previewViewEl, letters).init();
                    this.handleActions(previewLinkHints);
                    break;
                }
                case VIEW_MODE.SOURCE: {
                    const cm6Editor = this.cmEditor;
                    const livePreviewLinks = new CM6LinkProcessor(cm6Editor, letters).init();
                    cm6Editor.plugin(this.markViewPlugin).setLinks(livePreviewLinks);
                    this.app.workspace.updateOptions();
                    this.handleActions(livePreviewLinks);
                    break;
                }
            }
        };
        /*
        *  caseSensitive is only for lightspeed and shall not affect jumpToAnywhere, so it is true
        *  by default
        */
        this.handleJumpToRegex = (stringToSearch, caseSensitive = true) => {
            const { settings: { letters, jumpToAnywhereRegex } } = this;
            const whatToLookAt = stringToSearch || jumpToAnywhereRegex;
            const { mode } = this;
            switch (mode) {
                case VIEW_MODE.SOURCE:
                    this.handleMarkdownRegex(letters, whatToLookAt, caseSensitive);
                    break;
                case VIEW_MODE.LIVE_PREVIEW:
                    this.handleMarkdownRegex(letters, whatToLookAt, caseSensitive);
                    break;
                case VIEW_MODE.PREVIEW:
                    break;
                case VIEW_MODE.LEGACY:
                    const cmEditor = this.cmEditor;
                    const links = new LegacyRegexpProcessor(cmEditor, whatToLookAt, letters, caseSensitive).init();
                    this.handleActions(links);
                    break;
            }
        };
        this.handleMarkdownRegex = (letters, whatToLookAt, caseSensitive) => {
            const cm6Editor = this.cmEditor;
            const livePreviewLinks = new CM6RegexProcessor(cm6Editor, letters, whatToLookAt, caseSensitive).init();
            cm6Editor.plugin(this.markViewPlugin).setLinks(livePreviewLinks);
            this.app.workspace.updateOptions();
            this.handleActions(livePreviewLinks);
        };
    }
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = (yield this.loadData()) || new Settings();
            this.addSettingTab(new SettingTab(this.app, this));
            const markViewPlugin = this.markViewPlugin = view.ViewPlugin.fromClass(MarkPlugin, {
                decorations: (v) => v.decorations
            });
            this.registerEditorExtension([markViewPlugin]);
            this.watchForSelectionChange();
            this.addCommand({
                id: 'activate-jump-to-link',
                name: 'Jump to Link',
                callback: this.action.bind(this, 'link'),
                hotkeys: [{ modifiers: ['Ctrl'], key: `'` }],
            });
            this.addCommand({
                id: "activate-jump-to-anywhere",
                name: "Jump to Anywhere Regex",
                callback: this.action.bind(this, 'regexp'),
                hotkeys: [{ modifiers: ["Ctrl"], key: ";" }],
            });
            this.addCommand({
                id: "activate-lightspeed-jump",
                name: "Lightspeed Jump",
                callback: this.action.bind(this, 'lightspeed'),
                hotkeys: [],
            });
        });
    }
    onunload() {
        console.log('unloading jump to links plugin');
    }
    action(type) {
        if (this.isLinkHintActive) {
            return;
        }
        const activeViewOfType = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!activeViewOfType) {
            return;
        }
        const currentView = this.currentView = activeViewOfType.leaf.view;
        const mode = this.mode = this.getMode(this.currentView);
        this.contentElement = activeViewOfType.contentEl;
        this.cursorBeforeJump = this.currentCursor;
        switch (mode) {
            case VIEW_MODE.LEGACY:
                this.cmEditor = currentView.sourceMode.cmEditor;
                break;
            case VIEW_MODE.LIVE_PREVIEW:
            case VIEW_MODE.SOURCE:
                this.cmEditor = currentView.editor.cm;
                break;
        }
        switch (type) {
            case "link":
                this.handleJumpToLink();
                return;
            case "regexp":
                this.handleJumpToRegex();
                return;
            case "lightspeed":
                this.handleLightspeedJump();
                return;
        }
    }
    getMode(currentView) {
        var _a;
        // @ts-ignore
        const isLegacy = this.app.vault.getConfig("legacyEditor");
        if (currentView.getState().mode === 'preview') {
            return VIEW_MODE.PREVIEW;
        }
        else if (isLegacy) {
            return VIEW_MODE.LEGACY;
        }
        else if (currentView.getState().mode === 'source') {
            try {
                const isLivePreview = (_a = currentView.editor.cm.state) === null || _a === void 0 ? void 0 : _a.field(obsidian.editorLivePreviewField);
                if (isLivePreview)
                    return VIEW_MODE.LIVE_PREVIEW;
            }
            catch (e) {
                console.error(e);
            }
            return VIEW_MODE.SOURCE;
        }
    }
    // adapted from: https://github.com/mrjackphil/obsidian-jump-to-link/issues/35#issuecomment-1085905668
    handleLightspeedJump() {
        // get all text color
        const { contentEl } = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!contentEl) {
            return;
        }
        // this element doesn't exist in cm5/has a different class, so lightspeed will not work in cm5
        const contentContainerColor = contentEl.getElementsByClassName("cm-contentContainer");
        const originalColor = contentContainerColor[0].style.color;
        // change all text color to gray
        contentContainerColor[0].style.color = 'var(--jump-to-link-lightspeed-color)';
        const keyArray = [];
        const grabKey = (event) => {
            event.preventDefault();
            // handle Escape to reject the mode
            if (event.key === 'Escape') {
                contentEl.removeEventListener("keydown", grabKey, { capture: true });
                contentContainerColor[0].style.color = originalColor;
            }
            // test if keypress is capitalized
            if (/^[\w\S\W]$/i.test(event.key)) {
                const isCapital = event.shiftKey;
                if (isCapital) {
                    // capture uppercase
                    keyArray.push((event.key).toUpperCase());
                }
                else {
                    // capture lowercase
                    keyArray.push(event.key);
                }
            }
            // stop when length of array is equal to lightspeedCharacterCount
            if (keyArray.length === this.settings.lightspeedCharacterCount) {
                const stringToSearch = this.settings.lightspeedJumpToStartOfWord ? "\\b" + keyArray.join("") : keyArray.join("");
                this.handleJumpToRegex(stringToSearch, this.settings.lightspeedCaseSensitive);
                // removing eventListener after proceeded
                contentEl.removeEventListener("keydown", grabKey, { capture: true });
                contentContainerColor[0].style.color = originalColor;
            }
        };
        contentEl.addEventListener('keydown', grabKey, { capture: true });
    }
    handleHotkey(heldShiftKey, link) {
        if (link.linkElement) {
            const event = new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                view: window,
                metaKey: heldShiftKey,
            });
            link.linkElement.dispatchEvent(event);
        }
        else if (link.type === 'internal') {
            const file = this.app.workspace.getActiveFile();
            if (file) {
                // the second argument is for the link resolution
                this.app.workspace.openLinkText(decodeURI(link.linkText), file.path, heldShiftKey, { active: true });
            }
        }
        else if (link.type === 'external') {
            window.open(link.linkText);
        }
        else {
            const editor = this.cmEditor;
            if (editor instanceof view.EditorView) {
                const index = link.index;
                const { vimMode, anchor } = this.cursorBeforeJump;
                const useSelection = heldShiftKey || (vimMode === 'visual' || vimMode === 'visual block');
                if (useSelection && anchor !== undefined) {
                    editor.dispatch({ selection: state.EditorSelection.range(anchor, index) });
                }
                else {
                    editor.dispatch({ selection: state.EditorSelection.cursor(index) });
                }
            }
            else {
                editor.setCursor(editor.posFromIndex(link.index));
            }
        }
    }
    removePopovers(linkHintHtmlElements = []) {
        const currentView = this.contentElement;
        currentView.removeEventListener('click', () => this.removePopovers(linkHintHtmlElements));
        linkHintHtmlElements === null || linkHintHtmlElements === void 0 ? void 0 : linkHintHtmlElements.forEach(e => e.remove());
        currentView.querySelectorAll('.jl.popover').forEach(e => e.remove());
        this.prefixInfo = undefined;
        if (this.mode == VIEW_MODE.SOURCE || this.mode == VIEW_MODE.LIVE_PREVIEW) {
            this.cmEditor.plugin(this.markViewPlugin).clean();
        }
        this.app.workspace.updateOptions();
        this.isLinkHintActive = false;
    }
    removePopoversWithoutPrefixEventKey(eventKey, linkHintHtmlElements = []) {
        const currentView = this.contentElement;
        linkHintHtmlElements === null || linkHintHtmlElements === void 0 ? void 0 : linkHintHtmlElements.forEach(e => {
            if (e.innerHTML.length == 2 && e.innerHTML[0] == eventKey) {
                e.classList.add("matched");
                return;
            }
            e.remove();
        });
        currentView.querySelectorAll('.jl.popover').forEach(e => {
            if (e.innerHTML.length == 2 && e.innerHTML[0] == eventKey) {
                e.classList.add("matched");
                return;
            }
            e.remove();
        });
        if (this.mode == VIEW_MODE.SOURCE || this.mode == VIEW_MODE.LIVE_PREVIEW) {
            this.cmEditor.plugin(this.markViewPlugin).filterWithEventKey(eventKey);
        }
        this.app.workspace.updateOptions();
    }
    handleActions(linkHints, linkHintHtmlElements) {
        var _a;
        const contentElement = this.contentElement;
        if (!linkHints.length) {
            return;
        }
        const linkHintMap = {};
        linkHints.forEach(x => linkHintMap[x.letter] = x);
        const handleKeyDown = (event) => {
            var _a;
            if (['Shift', 'Control', 'CapsLock', 'ScrollLock', 'GroupNext', 'Meta'].includes(event.key)) {
                return;
            }
            const eventKey = event.key.toUpperCase();
            const prefixes = new Set(Object.keys(linkHintMap).filter(x => x.length > 1).map(x => x[0]));
            let linkHint;
            if (this.prefixInfo) {
                linkHint = linkHintMap[this.prefixInfo.prefix + eventKey];
            }
            else {
                linkHint = linkHintMap[eventKey];
                if (!linkHint && prefixes && prefixes.has(eventKey)) {
                    this.prefixInfo = { prefix: eventKey, shiftKey: event.shiftKey };
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    this.removePopoversWithoutPrefixEventKey(eventKey, linkHintHtmlElements);
                    return;
                }
            }
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const heldShiftKey = ((_a = this.prefixInfo) === null || _a === void 0 ? void 0 : _a.shiftKey) || event.shiftKey;
            linkHint && this.handleHotkey(heldShiftKey, linkHint);
            this.removePopovers(linkHintHtmlElements);
            contentElement.removeEventListener('keydown', handleKeyDown, { capture: true });
        };
        if (linkHints.length === 1 && this.settings.jumpToLinkIfOneLinkOnly) {
            const heldShiftKey = (_a = this.prefixInfo) === null || _a === void 0 ? void 0 : _a.shiftKey;
            this.handleHotkey(heldShiftKey, linkHints[0]);
            this.removePopovers(linkHintHtmlElements);
            return;
        }
        contentElement.addEventListener('click', () => this.removePopovers(linkHintHtmlElements));
        contentElement.addEventListener('keydown', handleKeyDown, { capture: true });
        this.isLinkHintActive = true;
    }
    /**
     * CodeMirror's vim automatically exits visual mode when executing a command.
     * This keeps track of selection changes so we can restore the selection.
     *
     * This is the same approach taken by the obsidian-vimrc-plugin
     */
    watchForSelectionChange() {
        const updateSelection = this.updateSelection.bind(this);
        const watchForChanges = () => {
            var _a, _b;
            const editor = (_a = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView)) === null || _a === void 0 ? void 0 : _a.editor;
            const cm = (_b = editor === null || editor === void 0 ? void 0 : editor.cm) === null || _b === void 0 ? void 0 : _b.cm;
            if (cm && !cm._handlers.cursorActivity.includes(updateSelection)) {
                cm.on("cursorActivity", updateSelection);
                this.register(() => cm.off("cursorActivity", updateSelection));
            }
        };
        this.registerEvent(this.app.workspace.on("active-leaf-change", watchForChanges));
        this.registerEvent(this.app.workspace.on("file-open", watchForChanges));
        watchForChanges();
    }
    updateSelection(editor) {
        var _a, _b;
        const anchor = (_a = editor.listSelections()[0]) === null || _a === void 0 ? void 0 : _a.anchor;
        this.currentCursor = {
            anchor: anchor ? editor.indexFromPos(anchor) : undefined,
            vimMode: (_b = editor.state.vim) === null || _b === void 0 ? void 0 : _b.mode
        };
    }
}
class SettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        let { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Settings for Jump To Link.' });
        new obsidian.Setting(containerEl)
            .setName('Characters used for link hints')
            .setDesc('The characters placed next to each link after enter link-hint mode.')
            .addText(cb => {
            cb.setValue(this.plugin.settings.letters)
                .onChange((value) => {
                this.plugin.settings.letters = value;
                this.plugin.saveData(this.plugin.settings);
            });
        });
        new obsidian.Setting(containerEl)
            .setName('Jump To Anywhere')
            .setDesc("Regex based navigating in editor mode")
            .addText((text) => text
            .setPlaceholder('Custom Regex')
            .setValue(this.plugin.settings.jumpToAnywhereRegex)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.jumpToAnywhereRegex = value;
            yield this.plugin.saveData(this.plugin.settings);
        })));
        new obsidian.Setting(containerEl)
            .setName('Lightspeed regex case sensitivity')
            .setDesc('If enabled, the regex for matching will be case sensitive.')
            .addToggle((toggle) => {
            toggle.setValue(this.plugin.settings.lightspeedCaseSensitive)
                .onChange((state) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.lightspeedCaseSensitive = state;
                yield this.plugin.saveData(this.plugin.settings);
            }));
        });
        new obsidian.Setting(containerEl)
            .setName('Jump to Link If Only One Link In Page')
            .setDesc('If enabled, auto jump to link if there is only one link in page')
            .addToggle((toggle) => {
            toggle.setValue(this.plugin.settings.jumpToLinkIfOneLinkOnly)
                .onChange((state) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.jumpToLinkIfOneLinkOnly = state;
                yield this.plugin.saveData(this.plugin.settings);
            }));
        });
        new obsidian.Setting(containerEl)
            .setName('Lightspeed only jumps to start of words')
            .setDesc('If enabled, lightspeed jumps will only target characters occuring at the start of words.')
            .addToggle((toggle) => {
            toggle.setValue(this.plugin.settings.lightspeedJumpToStartOfWord)
                .onChange((state) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.lightspeedJumpToStartOfWord = state;
                yield this.plugin.saveData(this.plugin.settings);
            }));
        });
        new obsidian.Setting(containerEl)
            .setName('Number of characters for Lightspeed jump')
            .setDesc('Determines how many characters you need to type to perform a Lightspeed jump.')
            .addText((text) => (text
            .setValue(String(this.plugin.settings.lightspeedCharacterCount))
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            const num = Number(value);
            if (!isNaN(num)) {
                this.plugin.settings.lightspeedCharacterCount = num;
                yield this.plugin.saveData(this.plugin.settings);
            }
        })).inputEl.type = "number"));
    }
}

module.exports = JumpToLink;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsibm9kZV9tb2R1bGVzL3RzbGliL3RzbGliLmVzNi5qcyIsInR5cGVzLnRzIiwic3JjL2NtNi13aWRnZXQvTWFya1dpZGdldC50cyIsInNyYy9jbTYtd2lkZ2V0L01hcmtQbHVnaW4udHMiLCJzcmMvdXRpbHMvY29tbW9uLnRzIiwic3JjL3Byb2Nlc3NvcnMvQ002TGlua1Byb2Nlc3Nvci50cyIsInNyYy91dGlscy9yZWdleHAudHMiLCJzcmMvcHJvY2Vzc29ycy9DTTZSZWdleFByb2Nlc3Nvci50cyIsInNyYy9wcm9jZXNzb3JzL0xlZ2FjeVJlZ2V4cFByb2Nlc3Nvci50cyIsInNyYy9wcm9jZXNzb3JzL0xlZ2FjeVNvdXJjZUxpbmtQcm9jZXNzb3IudHMiLCJzcmMvdXRpbHMvcHJldmlldy50cyIsInNyYy9wcm9jZXNzb3JzL1ByZXZpZXdMaW5rUHJvY2Vzc29yLnRzIiwic3JjL3Byb2Nlc3NvcnMvTGl2ZVByZXZpZXdMaW5rUHJvY2Vzc29yLnRzIiwic3JjL21haW4udHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG5Db3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi5cclxuXHJcblBlcm1pc3Npb24gdG8gdXNlLCBjb3B5LCBtb2RpZnksIGFuZC9vciBkaXN0cmlidXRlIHRoaXMgc29mdHdhcmUgZm9yIGFueVxyXG5wdXJwb3NlIHdpdGggb3Igd2l0aG91dCBmZWUgaXMgaGVyZWJ5IGdyYW50ZWQuXHJcblxyXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiIEFORCBUSEUgQVVUSE9SIERJU0NMQUlNUyBBTEwgV0FSUkFOVElFUyBXSVRIXHJcblJFR0FSRCBUTyBUSElTIFNPRlRXQVJFIElOQ0xVRElORyBBTEwgSU1QTElFRCBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWVxyXG5BTkQgRklUTkVTUy4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUiBCRSBMSUFCTEUgRk9SIEFOWSBTUEVDSUFMLCBESVJFQ1QsXHJcbklORElSRUNULCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVMgT1IgQU5ZIERBTUFHRVMgV0hBVFNPRVZFUiBSRVNVTFRJTkcgRlJPTVxyXG5MT1NTIE9GIFVTRSwgREFUQSBPUiBQUk9GSVRTLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgTkVHTElHRU5DRSBPUlxyXG5PVEhFUiBUT1JUSU9VUyBBQ1RJT04sIEFSSVNJTkcgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgVVNFIE9SXHJcblBFUkZPUk1BTkNFIE9GIFRISVMgU09GVFdBUkUuXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqICovXHJcbi8qIGdsb2JhbCBSZWZsZWN0LCBQcm9taXNlLCBTdXBwcmVzc2VkRXJyb3IsIFN5bWJvbCwgSXRlcmF0b3IgKi9cclxuXHJcbnZhciBleHRlbmRTdGF0aWNzID0gZnVuY3Rpb24oZCwgYikge1xyXG4gICAgZXh0ZW5kU3RhdGljcyA9IE9iamVjdC5zZXRQcm90b3R5cGVPZiB8fFxyXG4gICAgICAgICh7IF9fcHJvdG9fXzogW10gfSBpbnN0YW5jZW9mIEFycmF5ICYmIGZ1bmN0aW9uIChkLCBiKSB7IGQuX19wcm90b19fID0gYjsgfSkgfHxcclxuICAgICAgICBmdW5jdGlvbiAoZCwgYikgeyBmb3IgKHZhciBwIGluIGIpIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoYiwgcCkpIGRbcF0gPSBiW3BdOyB9O1xyXG4gICAgcmV0dXJuIGV4dGVuZFN0YXRpY3MoZCwgYik7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19leHRlbmRzKGQsIGIpIHtcclxuICAgIGlmICh0eXBlb2YgYiAhPT0gXCJmdW5jdGlvblwiICYmIGIgIT09IG51bGwpXHJcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkNsYXNzIGV4dGVuZHMgdmFsdWUgXCIgKyBTdHJpbmcoYikgKyBcIiBpcyBub3QgYSBjb25zdHJ1Y3RvciBvciBudWxsXCIpO1xyXG4gICAgZXh0ZW5kU3RhdGljcyhkLCBiKTtcclxuICAgIGZ1bmN0aW9uIF9fKCkgeyB0aGlzLmNvbnN0cnVjdG9yID0gZDsgfVxyXG4gICAgZC5wcm90b3R5cGUgPSBiID09PSBudWxsID8gT2JqZWN0LmNyZWF0ZShiKSA6IChfXy5wcm90b3R5cGUgPSBiLnByb3RvdHlwZSwgbmV3IF9fKCkpO1xyXG59XHJcblxyXG5leHBvcnQgdmFyIF9fYXNzaWduID0gZnVuY3Rpb24oKSB7XHJcbiAgICBfX2Fzc2lnbiA9IE9iamVjdC5hc3NpZ24gfHwgZnVuY3Rpb24gX19hc3NpZ24odCkge1xyXG4gICAgICAgIGZvciAodmFyIHMsIGkgPSAxLCBuID0gYXJndW1lbnRzLmxlbmd0aDsgaSA8IG47IGkrKykge1xyXG4gICAgICAgICAgICBzID0gYXJndW1lbnRzW2ldO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBwIGluIHMpIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocywgcCkpIHRbcF0gPSBzW3BdO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdDtcclxuICAgIH1cclxuICAgIHJldHVybiBfX2Fzc2lnbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19yZXN0KHMsIGUpIHtcclxuICAgIHZhciB0ID0ge307XHJcbiAgICBmb3IgKHZhciBwIGluIHMpIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocywgcCkgJiYgZS5pbmRleE9mKHApIDwgMClcclxuICAgICAgICB0W3BdID0gc1twXTtcclxuICAgIGlmIChzICE9IG51bGwgJiYgdHlwZW9mIE9iamVjdC5nZXRPd25Qcm9wZXJ0eVN5bWJvbHMgPT09IFwiZnVuY3Rpb25cIilcclxuICAgICAgICBmb3IgKHZhciBpID0gMCwgcCA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eVN5bWJvbHMocyk7IGkgPCBwLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGlmIChlLmluZGV4T2YocFtpXSkgPCAwICYmIE9iamVjdC5wcm90b3R5cGUucHJvcGVydHlJc0VudW1lcmFibGUuY2FsbChzLCBwW2ldKSlcclxuICAgICAgICAgICAgICAgIHRbcFtpXV0gPSBzW3BbaV1dO1xyXG4gICAgICAgIH1cclxuICAgIHJldHVybiB0O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19kZWNvcmF0ZShkZWNvcmF0b3JzLCB0YXJnZXQsIGtleSwgZGVzYykge1xyXG4gICAgdmFyIGMgPSBhcmd1bWVudHMubGVuZ3RoLCByID0gYyA8IDMgPyB0YXJnZXQgOiBkZXNjID09PSBudWxsID8gZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodGFyZ2V0LCBrZXkpIDogZGVzYywgZDtcclxuICAgIGlmICh0eXBlb2YgUmVmbGVjdCA9PT0gXCJvYmplY3RcIiAmJiB0eXBlb2YgUmVmbGVjdC5kZWNvcmF0ZSA9PT0gXCJmdW5jdGlvblwiKSByID0gUmVmbGVjdC5kZWNvcmF0ZShkZWNvcmF0b3JzLCB0YXJnZXQsIGtleSwgZGVzYyk7XHJcbiAgICBlbHNlIGZvciAodmFyIGkgPSBkZWNvcmF0b3JzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSBpZiAoZCA9IGRlY29yYXRvcnNbaV0pIHIgPSAoYyA8IDMgPyBkKHIpIDogYyA+IDMgPyBkKHRhcmdldCwga2V5LCByKSA6IGQodGFyZ2V0LCBrZXkpKSB8fCByO1xyXG4gICAgcmV0dXJuIGMgPiAzICYmIHIgJiYgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwga2V5LCByKSwgcjtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fcGFyYW0ocGFyYW1JbmRleCwgZGVjb3JhdG9yKSB7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24gKHRhcmdldCwga2V5KSB7IGRlY29yYXRvcih0YXJnZXQsIGtleSwgcGFyYW1JbmRleCk7IH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZXNEZWNvcmF0ZShjdG9yLCBkZXNjcmlwdG9ySW4sIGRlY29yYXRvcnMsIGNvbnRleHRJbiwgaW5pdGlhbGl6ZXJzLCBleHRyYUluaXRpYWxpemVycykge1xyXG4gICAgZnVuY3Rpb24gYWNjZXB0KGYpIHsgaWYgKGYgIT09IHZvaWQgMCAmJiB0eXBlb2YgZiAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRnVuY3Rpb24gZXhwZWN0ZWRcIik7IHJldHVybiBmOyB9XHJcbiAgICB2YXIga2luZCA9IGNvbnRleHRJbi5raW5kLCBrZXkgPSBraW5kID09PSBcImdldHRlclwiID8gXCJnZXRcIiA6IGtpbmQgPT09IFwic2V0dGVyXCIgPyBcInNldFwiIDogXCJ2YWx1ZVwiO1xyXG4gICAgdmFyIHRhcmdldCA9ICFkZXNjcmlwdG9ySW4gJiYgY3RvciA/IGNvbnRleHRJbltcInN0YXRpY1wiXSA/IGN0b3IgOiBjdG9yLnByb3RvdHlwZSA6IG51bGw7XHJcbiAgICB2YXIgZGVzY3JpcHRvciA9IGRlc2NyaXB0b3JJbiB8fCAodGFyZ2V0ID8gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih0YXJnZXQsIGNvbnRleHRJbi5uYW1lKSA6IHt9KTtcclxuICAgIHZhciBfLCBkb25lID0gZmFsc2U7XHJcbiAgICBmb3IgKHZhciBpID0gZGVjb3JhdG9ycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgIHZhciBjb250ZXh0ID0ge307XHJcbiAgICAgICAgZm9yICh2YXIgcCBpbiBjb250ZXh0SW4pIGNvbnRleHRbcF0gPSBwID09PSBcImFjY2Vzc1wiID8ge30gOiBjb250ZXh0SW5bcF07XHJcbiAgICAgICAgZm9yICh2YXIgcCBpbiBjb250ZXh0SW4uYWNjZXNzKSBjb250ZXh0LmFjY2Vzc1twXSA9IGNvbnRleHRJbi5hY2Nlc3NbcF07XHJcbiAgICAgICAgY29udGV4dC5hZGRJbml0aWFsaXplciA9IGZ1bmN0aW9uIChmKSB7IGlmIChkb25lKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IGFkZCBpbml0aWFsaXplcnMgYWZ0ZXIgZGVjb3JhdGlvbiBoYXMgY29tcGxldGVkXCIpOyBleHRyYUluaXRpYWxpemVycy5wdXNoKGFjY2VwdChmIHx8IG51bGwpKTsgfTtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gKDAsIGRlY29yYXRvcnNbaV0pKGtpbmQgPT09IFwiYWNjZXNzb3JcIiA/IHsgZ2V0OiBkZXNjcmlwdG9yLmdldCwgc2V0OiBkZXNjcmlwdG9yLnNldCB9IDogZGVzY3JpcHRvcltrZXldLCBjb250ZXh0KTtcclxuICAgICAgICBpZiAoa2luZCA9PT0gXCJhY2Nlc3NvclwiKSB7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQgPT09IHZvaWQgMCkgY29udGludWU7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQgPT09IG51bGwgfHwgdHlwZW9mIHJlc3VsdCAhPT0gXCJvYmplY3RcIikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk9iamVjdCBleHBlY3RlZFwiKTtcclxuICAgICAgICAgICAgaWYgKF8gPSBhY2NlcHQocmVzdWx0LmdldCkpIGRlc2NyaXB0b3IuZ2V0ID0gXztcclxuICAgICAgICAgICAgaWYgKF8gPSBhY2NlcHQocmVzdWx0LnNldCkpIGRlc2NyaXB0b3Iuc2V0ID0gXztcclxuICAgICAgICAgICAgaWYgKF8gPSBhY2NlcHQocmVzdWx0LmluaXQpKSBpbml0aWFsaXplcnMudW5zaGlmdChfKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAoXyA9IGFjY2VwdChyZXN1bHQpKSB7XHJcbiAgICAgICAgICAgIGlmIChraW5kID09PSBcImZpZWxkXCIpIGluaXRpYWxpemVycy51bnNoaWZ0KF8pO1xyXG4gICAgICAgICAgICBlbHNlIGRlc2NyaXB0b3Jba2V5XSA9IF87XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKHRhcmdldCkgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgY29udGV4dEluLm5hbWUsIGRlc2NyaXB0b3IpO1xyXG4gICAgZG9uZSA9IHRydWU7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19ydW5Jbml0aWFsaXplcnModGhpc0FyZywgaW5pdGlhbGl6ZXJzLCB2YWx1ZSkge1xyXG4gICAgdmFyIHVzZVZhbHVlID0gYXJndW1lbnRzLmxlbmd0aCA+IDI7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGluaXRpYWxpemVycy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhbHVlID0gdXNlVmFsdWUgPyBpbml0aWFsaXplcnNbaV0uY2FsbCh0aGlzQXJnLCB2YWx1ZSkgOiBpbml0aWFsaXplcnNbaV0uY2FsbCh0aGlzQXJnKTtcclxuICAgIH1cclxuICAgIHJldHVybiB1c2VWYWx1ZSA/IHZhbHVlIDogdm9pZCAwO1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fcHJvcEtleSh4KSB7XHJcbiAgICByZXR1cm4gdHlwZW9mIHggPT09IFwic3ltYm9sXCIgPyB4IDogXCJcIi5jb25jYXQoeCk7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19zZXRGdW5jdGlvbk5hbWUoZiwgbmFtZSwgcHJlZml4KSB7XHJcbiAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3ltYm9sXCIpIG5hbWUgPSBuYW1lLmRlc2NyaXB0aW9uID8gXCJbXCIuY29uY2F0KG5hbWUuZGVzY3JpcHRpb24sIFwiXVwiKSA6IFwiXCI7XHJcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnR5KGYsIFwibmFtZVwiLCB7IGNvbmZpZ3VyYWJsZTogdHJ1ZSwgdmFsdWU6IHByZWZpeCA/IFwiXCIuY29uY2F0KHByZWZpeCwgXCIgXCIsIG5hbWUpIDogbmFtZSB9KTtcclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX21ldGFkYXRhKG1ldGFkYXRhS2V5LCBtZXRhZGF0YVZhbHVlKSB7XHJcbiAgICBpZiAodHlwZW9mIFJlZmxlY3QgPT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIFJlZmxlY3QubWV0YWRhdGEgPT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIFJlZmxlY3QubWV0YWRhdGEobWV0YWRhdGFLZXksIG1ldGFkYXRhVmFsdWUpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hd2FpdGVyKHRoaXNBcmcsIF9hcmd1bWVudHMsIFAsIGdlbmVyYXRvcikge1xyXG4gICAgZnVuY3Rpb24gYWRvcHQodmFsdWUpIHsgcmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgUCA/IHZhbHVlIDogbmV3IFAoZnVuY3Rpb24gKHJlc29sdmUpIHsgcmVzb2x2ZSh2YWx1ZSk7IH0pOyB9XHJcbiAgICByZXR1cm4gbmV3IChQIHx8IChQID0gUHJvbWlzZSkpKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICBmdW5jdGlvbiBmdWxmaWxsZWQodmFsdWUpIHsgdHJ5IHsgc3RlcChnZW5lcmF0b3IubmV4dCh2YWx1ZSkpOyB9IGNhdGNoIChlKSB7IHJlamVjdChlKTsgfSB9XHJcbiAgICAgICAgZnVuY3Rpb24gcmVqZWN0ZWQodmFsdWUpIHsgdHJ5IHsgc3RlcChnZW5lcmF0b3JbXCJ0aHJvd1wiXSh2YWx1ZSkpOyB9IGNhdGNoIChlKSB7IHJlamVjdChlKTsgfSB9XHJcbiAgICAgICAgZnVuY3Rpb24gc3RlcChyZXN1bHQpIHsgcmVzdWx0LmRvbmUgPyByZXNvbHZlKHJlc3VsdC52YWx1ZSkgOiBhZG9wdChyZXN1bHQudmFsdWUpLnRoZW4oZnVsZmlsbGVkLCByZWplY3RlZCk7IH1cclxuICAgICAgICBzdGVwKChnZW5lcmF0b3IgPSBnZW5lcmF0b3IuYXBwbHkodGhpc0FyZywgX2FyZ3VtZW50cyB8fCBbXSkpLm5leHQoKSk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZ2VuZXJhdG9yKHRoaXNBcmcsIGJvZHkpIHtcclxuICAgIHZhciBfID0geyBsYWJlbDogMCwgc2VudDogZnVuY3Rpb24oKSB7IGlmICh0WzBdICYgMSkgdGhyb3cgdFsxXTsgcmV0dXJuIHRbMV07IH0sIHRyeXM6IFtdLCBvcHM6IFtdIH0sIGYsIHksIHQsIGcgPSBPYmplY3QuY3JlYXRlKCh0eXBlb2YgSXRlcmF0b3IgPT09IFwiZnVuY3Rpb25cIiA/IEl0ZXJhdG9yIDogT2JqZWN0KS5wcm90b3R5cGUpO1xyXG4gICAgcmV0dXJuIGcubmV4dCA9IHZlcmIoMCksIGdbXCJ0aHJvd1wiXSA9IHZlcmIoMSksIGdbXCJyZXR1cm5cIl0gPSB2ZXJiKDIpLCB0eXBlb2YgU3ltYm9sID09PSBcImZ1bmN0aW9uXCIgJiYgKGdbU3ltYm9sLml0ZXJhdG9yXSA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpczsgfSksIGc7XHJcbiAgICBmdW5jdGlvbiB2ZXJiKG4pIHsgcmV0dXJuIGZ1bmN0aW9uICh2KSB7IHJldHVybiBzdGVwKFtuLCB2XSk7IH07IH1cclxuICAgIGZ1bmN0aW9uIHN0ZXAob3ApIHtcclxuICAgICAgICBpZiAoZikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkdlbmVyYXRvciBpcyBhbHJlYWR5IGV4ZWN1dGluZy5cIik7XHJcbiAgICAgICAgd2hpbGUgKGcgJiYgKGcgPSAwLCBvcFswXSAmJiAoXyA9IDApKSwgXykgdHJ5IHtcclxuICAgICAgICAgICAgaWYgKGYgPSAxLCB5ICYmICh0ID0gb3BbMF0gJiAyID8geVtcInJldHVyblwiXSA6IG9wWzBdID8geVtcInRocm93XCJdIHx8ICgodCA9IHlbXCJyZXR1cm5cIl0pICYmIHQuY2FsbCh5KSwgMCkgOiB5Lm5leHQpICYmICEodCA9IHQuY2FsbCh5LCBvcFsxXSkpLmRvbmUpIHJldHVybiB0O1xyXG4gICAgICAgICAgICBpZiAoeSA9IDAsIHQpIG9wID0gW29wWzBdICYgMiwgdC52YWx1ZV07XHJcbiAgICAgICAgICAgIHN3aXRjaCAob3BbMF0pIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgMDogY2FzZSAxOiB0ID0gb3A7IGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSA0OiBfLmxhYmVsKys7IHJldHVybiB7IHZhbHVlOiBvcFsxXSwgZG9uZTogZmFsc2UgfTtcclxuICAgICAgICAgICAgICAgIGNhc2UgNTogXy5sYWJlbCsrOyB5ID0gb3BbMV07IG9wID0gWzBdOyBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIGNhc2UgNzogb3AgPSBfLm9wcy5wb3AoKTsgXy50cnlzLnBvcCgpOyBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCEodCA9IF8udHJ5cywgdCA9IHQubGVuZ3RoID4gMCAmJiB0W3QubGVuZ3RoIC0gMV0pICYmIChvcFswXSA9PT0gNiB8fCBvcFswXSA9PT0gMikpIHsgXyA9IDA7IGNvbnRpbnVlOyB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG9wWzBdID09PSAzICYmICghdCB8fCAob3BbMV0gPiB0WzBdICYmIG9wWzFdIDwgdFszXSkpKSB7IF8ubGFiZWwgPSBvcFsxXTsgYnJlYWs7IH1cclxuICAgICAgICAgICAgICAgICAgICBpZiAob3BbMF0gPT09IDYgJiYgXy5sYWJlbCA8IHRbMV0pIHsgXy5sYWJlbCA9IHRbMV07IHQgPSBvcDsgYnJlYWs7IH1cclxuICAgICAgICAgICAgICAgICAgICBpZiAodCAmJiBfLmxhYmVsIDwgdFsyXSkgeyBfLmxhYmVsID0gdFsyXTsgXy5vcHMucHVzaChvcCk7IGJyZWFrOyB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRbMl0pIF8ub3BzLnBvcCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIF8udHJ5cy5wb3AoKTsgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgb3AgPSBib2R5LmNhbGwodGhpc0FyZywgXyk7XHJcbiAgICAgICAgfSBjYXRjaCAoZSkgeyBvcCA9IFs2LCBlXTsgeSA9IDA7IH0gZmluYWxseSB7IGYgPSB0ID0gMDsgfVxyXG4gICAgICAgIGlmIChvcFswXSAmIDUpIHRocm93IG9wWzFdOyByZXR1cm4geyB2YWx1ZTogb3BbMF0gPyBvcFsxXSA6IHZvaWQgMCwgZG9uZTogdHJ1ZSB9O1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgdmFyIF9fY3JlYXRlQmluZGluZyA9IE9iamVjdC5jcmVhdGUgPyAoZnVuY3Rpb24obywgbSwgaywgazIpIHtcclxuICAgIGlmIChrMiA9PT0gdW5kZWZpbmVkKSBrMiA9IGs7XHJcbiAgICB2YXIgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IobSwgayk7XHJcbiAgICBpZiAoIWRlc2MgfHwgKFwiZ2V0XCIgaW4gZGVzYyA/ICFtLl9fZXNNb2R1bGUgOiBkZXNjLndyaXRhYmxlIHx8IGRlc2MuY29uZmlndXJhYmxlKSkge1xyXG4gICAgICAgIGRlc2MgPSB7IGVudW1lcmFibGU6IHRydWUsIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBtW2tdOyB9IH07XHJcbiAgICB9XHJcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkobywgazIsIGRlc2MpO1xyXG59KSA6IChmdW5jdGlvbihvLCBtLCBrLCBrMikge1xyXG4gICAgaWYgKGsyID09PSB1bmRlZmluZWQpIGsyID0gaztcclxuICAgIG9bazJdID0gbVtrXTtcclxufSk7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19leHBvcnRTdGFyKG0sIG8pIHtcclxuICAgIGZvciAodmFyIHAgaW4gbSkgaWYgKHAgIT09IFwiZGVmYXVsdFwiICYmICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwobywgcCkpIF9fY3JlYXRlQmluZGluZyhvLCBtLCBwKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fdmFsdWVzKG8pIHtcclxuICAgIHZhciBzID0gdHlwZW9mIFN5bWJvbCA9PT0gXCJmdW5jdGlvblwiICYmIFN5bWJvbC5pdGVyYXRvciwgbSA9IHMgJiYgb1tzXSwgaSA9IDA7XHJcbiAgICBpZiAobSkgcmV0dXJuIG0uY2FsbChvKTtcclxuICAgIGlmIChvICYmIHR5cGVvZiBvLmxlbmd0aCA9PT0gXCJudW1iZXJcIikgcmV0dXJuIHtcclxuICAgICAgICBuZXh0OiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIGlmIChvICYmIGkgPj0gby5sZW5ndGgpIG8gPSB2b2lkIDA7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHZhbHVlOiBvICYmIG9baSsrXSwgZG9uZTogIW8gfTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihzID8gXCJPYmplY3QgaXMgbm90IGl0ZXJhYmxlLlwiIDogXCJTeW1ib2wuaXRlcmF0b3IgaXMgbm90IGRlZmluZWQuXCIpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19yZWFkKG8sIG4pIHtcclxuICAgIHZhciBtID0gdHlwZW9mIFN5bWJvbCA9PT0gXCJmdW5jdGlvblwiICYmIG9bU3ltYm9sLml0ZXJhdG9yXTtcclxuICAgIGlmICghbSkgcmV0dXJuIG87XHJcbiAgICB2YXIgaSA9IG0uY2FsbChvKSwgciwgYXIgPSBbXSwgZTtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgd2hpbGUgKChuID09PSB2b2lkIDAgfHwgbi0tID4gMCkgJiYgIShyID0gaS5uZXh0KCkpLmRvbmUpIGFyLnB1c2goci52YWx1ZSk7XHJcbiAgICB9XHJcbiAgICBjYXRjaCAoZXJyb3IpIHsgZSA9IHsgZXJyb3I6IGVycm9yIH07IH1cclxuICAgIGZpbmFsbHkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGlmIChyICYmICFyLmRvbmUgJiYgKG0gPSBpW1wicmV0dXJuXCJdKSkgbS5jYWxsKGkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmaW5hbGx5IHsgaWYgKGUpIHRocm93IGUuZXJyb3I7IH1cclxuICAgIH1cclxuICAgIHJldHVybiBhcjtcclxufVxyXG5cclxuLyoqIEBkZXByZWNhdGVkICovXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3NwcmVhZCgpIHtcclxuICAgIGZvciAodmFyIGFyID0gW10sIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIGFyID0gYXIuY29uY2F0KF9fcmVhZChhcmd1bWVudHNbaV0pKTtcclxuICAgIHJldHVybiBhcjtcclxufVxyXG5cclxuLyoqIEBkZXByZWNhdGVkICovXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3NwcmVhZEFycmF5cygpIHtcclxuICAgIGZvciAodmFyIHMgPSAwLCBpID0gMCwgaWwgPSBhcmd1bWVudHMubGVuZ3RoOyBpIDwgaWw7IGkrKykgcyArPSBhcmd1bWVudHNbaV0ubGVuZ3RoO1xyXG4gICAgZm9yICh2YXIgciA9IEFycmF5KHMpLCBrID0gMCwgaSA9IDA7IGkgPCBpbDsgaSsrKVxyXG4gICAgICAgIGZvciAodmFyIGEgPSBhcmd1bWVudHNbaV0sIGogPSAwLCBqbCA9IGEubGVuZ3RoOyBqIDwgamw7IGorKywgaysrKVxyXG4gICAgICAgICAgICByW2tdID0gYVtqXTtcclxuICAgIHJldHVybiByO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19zcHJlYWRBcnJheSh0bywgZnJvbSwgcGFjaykge1xyXG4gICAgaWYgKHBhY2sgfHwgYXJndW1lbnRzLmxlbmd0aCA9PT0gMikgZm9yICh2YXIgaSA9IDAsIGwgPSBmcm9tLmxlbmd0aCwgYXI7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICBpZiAoYXIgfHwgIShpIGluIGZyb20pKSB7XHJcbiAgICAgICAgICAgIGlmICghYXIpIGFyID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoZnJvbSwgMCwgaSk7XHJcbiAgICAgICAgICAgIGFyW2ldID0gZnJvbVtpXTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdG8uY29uY2F0KGFyIHx8IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGZyb20pKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fYXdhaXQodikge1xyXG4gICAgcmV0dXJuIHRoaXMgaW5zdGFuY2VvZiBfX2F3YWl0ID8gKHRoaXMudiA9IHYsIHRoaXMpIDogbmV3IF9fYXdhaXQodik7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2FzeW5jR2VuZXJhdG9yKHRoaXNBcmcsIF9hcmd1bWVudHMsIGdlbmVyYXRvcikge1xyXG4gICAgaWYgKCFTeW1ib2wuYXN5bmNJdGVyYXRvcikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlN5bWJvbC5hc3luY0l0ZXJhdG9yIGlzIG5vdCBkZWZpbmVkLlwiKTtcclxuICAgIHZhciBnID0gZ2VuZXJhdG9yLmFwcGx5KHRoaXNBcmcsIF9hcmd1bWVudHMgfHwgW10pLCBpLCBxID0gW107XHJcbiAgICByZXR1cm4gaSA9IE9iamVjdC5jcmVhdGUoKHR5cGVvZiBBc3luY0l0ZXJhdG9yID09PSBcImZ1bmN0aW9uXCIgPyBBc3luY0l0ZXJhdG9yIDogT2JqZWN0KS5wcm90b3R5cGUpLCB2ZXJiKFwibmV4dFwiKSwgdmVyYihcInRocm93XCIpLCB2ZXJiKFwicmV0dXJuXCIsIGF3YWl0UmV0dXJuKSwgaVtTeW1ib2wuYXN5bmNJdGVyYXRvcl0gPSBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzOyB9LCBpO1xyXG4gICAgZnVuY3Rpb24gYXdhaXRSZXR1cm4oZikgeyByZXR1cm4gZnVuY3Rpb24gKHYpIHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh2KS50aGVuKGYsIHJlamVjdCk7IH07IH1cclxuICAgIGZ1bmN0aW9uIHZlcmIobiwgZikgeyBpZiAoZ1tuXSkgeyBpW25dID0gZnVuY3Rpb24gKHYpIHsgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChhLCBiKSB7IHEucHVzaChbbiwgdiwgYSwgYl0pID4gMSB8fCByZXN1bWUobiwgdik7IH0pOyB9OyBpZiAoZikgaVtuXSA9IGYoaVtuXSk7IH0gfVxyXG4gICAgZnVuY3Rpb24gcmVzdW1lKG4sIHYpIHsgdHJ5IHsgc3RlcChnW25dKHYpKTsgfSBjYXRjaCAoZSkgeyBzZXR0bGUocVswXVszXSwgZSk7IH0gfVxyXG4gICAgZnVuY3Rpb24gc3RlcChyKSB7IHIudmFsdWUgaW5zdGFuY2VvZiBfX2F3YWl0ID8gUHJvbWlzZS5yZXNvbHZlKHIudmFsdWUudikudGhlbihmdWxmaWxsLCByZWplY3QpIDogc2V0dGxlKHFbMF1bMl0sIHIpOyB9XHJcbiAgICBmdW5jdGlvbiBmdWxmaWxsKHZhbHVlKSB7IHJlc3VtZShcIm5leHRcIiwgdmFsdWUpOyB9XHJcbiAgICBmdW5jdGlvbiByZWplY3QodmFsdWUpIHsgcmVzdW1lKFwidGhyb3dcIiwgdmFsdWUpOyB9XHJcbiAgICBmdW5jdGlvbiBzZXR0bGUoZiwgdikgeyBpZiAoZih2KSwgcS5zaGlmdCgpLCBxLmxlbmd0aCkgcmVzdW1lKHFbMF1bMF0sIHFbMF1bMV0pOyB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2FzeW5jRGVsZWdhdG9yKG8pIHtcclxuICAgIHZhciBpLCBwO1xyXG4gICAgcmV0dXJuIGkgPSB7fSwgdmVyYihcIm5leHRcIiksIHZlcmIoXCJ0aHJvd1wiLCBmdW5jdGlvbiAoZSkgeyB0aHJvdyBlOyB9KSwgdmVyYihcInJldHVyblwiKSwgaVtTeW1ib2wuaXRlcmF0b3JdID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpczsgfSwgaTtcclxuICAgIGZ1bmN0aW9uIHZlcmIobiwgZikgeyBpW25dID0gb1tuXSA/IGZ1bmN0aW9uICh2KSB7IHJldHVybiAocCA9ICFwKSA/IHsgdmFsdWU6IF9fYXdhaXQob1tuXSh2KSksIGRvbmU6IGZhbHNlIH0gOiBmID8gZih2KSA6IHY7IH0gOiBmOyB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2FzeW5jVmFsdWVzKG8pIHtcclxuICAgIGlmICghU3ltYm9sLmFzeW5jSXRlcmF0b3IpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJTeW1ib2wuYXN5bmNJdGVyYXRvciBpcyBub3QgZGVmaW5lZC5cIik7XHJcbiAgICB2YXIgbSA9IG9bU3ltYm9sLmFzeW5jSXRlcmF0b3JdLCBpO1xyXG4gICAgcmV0dXJuIG0gPyBtLmNhbGwobykgOiAobyA9IHR5cGVvZiBfX3ZhbHVlcyA9PT0gXCJmdW5jdGlvblwiID8gX192YWx1ZXMobykgOiBvW1N5bWJvbC5pdGVyYXRvcl0oKSwgaSA9IHt9LCB2ZXJiKFwibmV4dFwiKSwgdmVyYihcInRocm93XCIpLCB2ZXJiKFwicmV0dXJuXCIpLCBpW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXM7IH0sIGkpO1xyXG4gICAgZnVuY3Rpb24gdmVyYihuKSB7IGlbbl0gPSBvW25dICYmIGZ1bmN0aW9uICh2KSB7IHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7IHYgPSBvW25dKHYpLCBzZXR0bGUocmVzb2x2ZSwgcmVqZWN0LCB2LmRvbmUsIHYudmFsdWUpOyB9KTsgfTsgfVxyXG4gICAgZnVuY3Rpb24gc2V0dGxlKHJlc29sdmUsIHJlamVjdCwgZCwgdikgeyBQcm9taXNlLnJlc29sdmUodikudGhlbihmdW5jdGlvbih2KSB7IHJlc29sdmUoeyB2YWx1ZTogdiwgZG9uZTogZCB9KTsgfSwgcmVqZWN0KTsgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19tYWtlVGVtcGxhdGVPYmplY3QoY29va2VkLCByYXcpIHtcclxuICAgIGlmIChPYmplY3QuZGVmaW5lUHJvcGVydHkpIHsgT2JqZWN0LmRlZmluZVByb3BlcnR5KGNvb2tlZCwgXCJyYXdcIiwgeyB2YWx1ZTogcmF3IH0pOyB9IGVsc2UgeyBjb29rZWQucmF3ID0gcmF3OyB9XHJcbiAgICByZXR1cm4gY29va2VkO1xyXG59O1xyXG5cclxudmFyIF9fc2V0TW9kdWxlRGVmYXVsdCA9IE9iamVjdC5jcmVhdGUgPyAoZnVuY3Rpb24obywgdikge1xyXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KG8sIFwiZGVmYXVsdFwiLCB7IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiB2IH0pO1xyXG59KSA6IGZ1bmN0aW9uKG8sIHYpIHtcclxuICAgIG9bXCJkZWZhdWx0XCJdID0gdjtcclxufTtcclxuXHJcbnZhciBvd25LZXlzID0gZnVuY3Rpb24obykge1xyXG4gICAgb3duS2V5cyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzIHx8IGZ1bmN0aW9uIChvKSB7XHJcbiAgICAgICAgdmFyIGFyID0gW107XHJcbiAgICAgICAgZm9yICh2YXIgayBpbiBvKSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG8sIGspKSBhclthci5sZW5ndGhdID0gaztcclxuICAgICAgICByZXR1cm4gYXI7XHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIG93bktleXMobyk7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19pbXBvcnRTdGFyKG1vZCkge1xyXG4gICAgaWYgKG1vZCAmJiBtb2QuX19lc01vZHVsZSkgcmV0dXJuIG1vZDtcclxuICAgIHZhciByZXN1bHQgPSB7fTtcclxuICAgIGlmIChtb2QgIT0gbnVsbCkgZm9yICh2YXIgayA9IG93bktleXMobW9kKSwgaSA9IDA7IGkgPCBrLmxlbmd0aDsgaSsrKSBpZiAoa1tpXSAhPT0gXCJkZWZhdWx0XCIpIF9fY3JlYXRlQmluZGluZyhyZXN1bHQsIG1vZCwga1tpXSk7XHJcbiAgICBfX3NldE1vZHVsZURlZmF1bHQocmVzdWx0LCBtb2QpO1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9faW1wb3J0RGVmYXVsdChtb2QpIHtcclxuICAgIHJldHVybiAobW9kICYmIG1vZC5fX2VzTW9kdWxlKSA/IG1vZCA6IHsgZGVmYXVsdDogbW9kIH07XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2NsYXNzUHJpdmF0ZUZpZWxkR2V0KHJlY2VpdmVyLCBzdGF0ZSwga2luZCwgZikge1xyXG4gICAgaWYgKGtpbmQgPT09IFwiYVwiICYmICFmKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUHJpdmF0ZSBhY2Nlc3NvciB3YXMgZGVmaW5lZCB3aXRob3V0IGEgZ2V0dGVyXCIpO1xyXG4gICAgaWYgKHR5cGVvZiBzdGF0ZSA9PT0gXCJmdW5jdGlvblwiID8gcmVjZWl2ZXIgIT09IHN0YXRlIHx8ICFmIDogIXN0YXRlLmhhcyhyZWNlaXZlcikpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW5ub3QgcmVhZCBwcml2YXRlIG1lbWJlciBmcm9tIGFuIG9iamVjdCB3aG9zZSBjbGFzcyBkaWQgbm90IGRlY2xhcmUgaXRcIik7XHJcbiAgICByZXR1cm4ga2luZCA9PT0gXCJtXCIgPyBmIDoga2luZCA9PT0gXCJhXCIgPyBmLmNhbGwocmVjZWl2ZXIpIDogZiA/IGYudmFsdWUgOiBzdGF0ZS5nZXQocmVjZWl2ZXIpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19jbGFzc1ByaXZhdGVGaWVsZFNldChyZWNlaXZlciwgc3RhdGUsIHZhbHVlLCBraW5kLCBmKSB7XHJcbiAgICBpZiAoa2luZCA9PT0gXCJtXCIpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJQcml2YXRlIG1ldGhvZCBpcyBub3Qgd3JpdGFibGVcIik7XHJcbiAgICBpZiAoa2luZCA9PT0gXCJhXCIgJiYgIWYpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJQcml2YXRlIGFjY2Vzc29yIHdhcyBkZWZpbmVkIHdpdGhvdXQgYSBzZXR0ZXJcIik7XHJcbiAgICBpZiAodHlwZW9mIHN0YXRlID09PSBcImZ1bmN0aW9uXCIgPyByZWNlaXZlciAhPT0gc3RhdGUgfHwgIWYgOiAhc3RhdGUuaGFzKHJlY2VpdmVyKSkgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkNhbm5vdCB3cml0ZSBwcml2YXRlIG1lbWJlciB0byBhbiBvYmplY3Qgd2hvc2UgY2xhc3MgZGlkIG5vdCBkZWNsYXJlIGl0XCIpO1xyXG4gICAgcmV0dXJuIChraW5kID09PSBcImFcIiA/IGYuY2FsbChyZWNlaXZlciwgdmFsdWUpIDogZiA/IGYudmFsdWUgPSB2YWx1ZSA6IHN0YXRlLnNldChyZWNlaXZlciwgdmFsdWUpKSwgdmFsdWU7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2NsYXNzUHJpdmF0ZUZpZWxkSW4oc3RhdGUsIHJlY2VpdmVyKSB7XHJcbiAgICBpZiAocmVjZWl2ZXIgPT09IG51bGwgfHwgKHR5cGVvZiByZWNlaXZlciAhPT0gXCJvYmplY3RcIiAmJiB0eXBlb2YgcmVjZWl2ZXIgIT09IFwiZnVuY3Rpb25cIikpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW5ub3QgdXNlICdpbicgb3BlcmF0b3Igb24gbm9uLW9iamVjdFwiKTtcclxuICAgIHJldHVybiB0eXBlb2Ygc3RhdGUgPT09IFwiZnVuY3Rpb25cIiA/IHJlY2VpdmVyID09PSBzdGF0ZSA6IHN0YXRlLmhhcyhyZWNlaXZlcik7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2FkZERpc3Bvc2FibGVSZXNvdXJjZShlbnYsIHZhbHVlLCBhc3luYykge1xyXG4gICAgaWYgKHZhbHVlICE9PSBudWxsICYmIHZhbHVlICE9PSB2b2lkIDApIHtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSBcIm9iamVjdFwiICYmIHR5cGVvZiB2YWx1ZSAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiT2JqZWN0IGV4cGVjdGVkLlwiKTtcclxuICAgICAgICB2YXIgZGlzcG9zZSwgaW5uZXI7XHJcbiAgICAgICAgaWYgKGFzeW5jKSB7XHJcbiAgICAgICAgICAgIGlmICghU3ltYm9sLmFzeW5jRGlzcG9zZSkgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlN5bWJvbC5hc3luY0Rpc3Bvc2UgaXMgbm90IGRlZmluZWQuXCIpO1xyXG4gICAgICAgICAgICBkaXNwb3NlID0gdmFsdWVbU3ltYm9sLmFzeW5jRGlzcG9zZV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChkaXNwb3NlID09PSB2b2lkIDApIHtcclxuICAgICAgICAgICAgaWYgKCFTeW1ib2wuZGlzcG9zZSkgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlN5bWJvbC5kaXNwb3NlIGlzIG5vdCBkZWZpbmVkLlwiKTtcclxuICAgICAgICAgICAgZGlzcG9zZSA9IHZhbHVlW1N5bWJvbC5kaXNwb3NlXTtcclxuICAgICAgICAgICAgaWYgKGFzeW5jKSBpbm5lciA9IGRpc3Bvc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0eXBlb2YgZGlzcG9zZSAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiT2JqZWN0IG5vdCBkaXNwb3NhYmxlLlwiKTtcclxuICAgICAgICBpZiAoaW5uZXIpIGRpc3Bvc2UgPSBmdW5jdGlvbigpIHsgdHJ5IHsgaW5uZXIuY2FsbCh0aGlzKTsgfSBjYXRjaCAoZSkgeyByZXR1cm4gUHJvbWlzZS5yZWplY3QoZSk7IH0gfTtcclxuICAgICAgICBlbnYuc3RhY2sucHVzaCh7IHZhbHVlOiB2YWx1ZSwgZGlzcG9zZTogZGlzcG9zZSwgYXN5bmM6IGFzeW5jIH0pO1xyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAoYXN5bmMpIHtcclxuICAgICAgICBlbnYuc3RhY2sucHVzaCh7IGFzeW5jOiB0cnVlIH0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHZhbHVlO1xyXG5cclxufVxyXG5cclxudmFyIF9TdXBwcmVzc2VkRXJyb3IgPSB0eXBlb2YgU3VwcHJlc3NlZEVycm9yID09PSBcImZ1bmN0aW9uXCIgPyBTdXBwcmVzc2VkRXJyb3IgOiBmdW5jdGlvbiAoZXJyb3IsIHN1cHByZXNzZWQsIG1lc3NhZ2UpIHtcclxuICAgIHZhciBlID0gbmV3IEVycm9yKG1lc3NhZ2UpO1xyXG4gICAgcmV0dXJuIGUubmFtZSA9IFwiU3VwcHJlc3NlZEVycm9yXCIsIGUuZXJyb3IgPSBlcnJvciwgZS5zdXBwcmVzc2VkID0gc3VwcHJlc3NlZCwgZTtcclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2Rpc3Bvc2VSZXNvdXJjZXMoZW52KSB7XHJcbiAgICBmdW5jdGlvbiBmYWlsKGUpIHtcclxuICAgICAgICBlbnYuZXJyb3IgPSBlbnYuaGFzRXJyb3IgPyBuZXcgX1N1cHByZXNzZWRFcnJvcihlLCBlbnYuZXJyb3IsIFwiQW4gZXJyb3Igd2FzIHN1cHByZXNzZWQgZHVyaW5nIGRpc3Bvc2FsLlwiKSA6IGU7XHJcbiAgICAgICAgZW52Lmhhc0Vycm9yID0gdHJ1ZTtcclxuICAgIH1cclxuICAgIHZhciByLCBzID0gMDtcclxuICAgIGZ1bmN0aW9uIG5leHQoKSB7XHJcbiAgICAgICAgd2hpbGUgKHIgPSBlbnYuc3RhY2sucG9wKCkpIHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGlmICghci5hc3luYyAmJiBzID09PSAxKSByZXR1cm4gcyA9IDAsIGVudi5zdGFjay5wdXNoKHIpLCBQcm9taXNlLnJlc29sdmUoKS50aGVuKG5leHQpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHIuZGlzcG9zZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciByZXN1bHQgPSByLmRpc3Bvc2UuY2FsbChyLnZhbHVlKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoci5hc3luYykgcmV0dXJuIHMgfD0gMiwgUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCkudGhlbihuZXh0LCBmdW5jdGlvbihlKSB7IGZhaWwoZSk7IHJldHVybiBuZXh0KCk7IH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZSBzIHw9IDE7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgICAgIGZhaWwoZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHMgPT09IDEpIHJldHVybiBlbnYuaGFzRXJyb3IgPyBQcm9taXNlLnJlamVjdChlbnYuZXJyb3IpIDogUHJvbWlzZS5yZXNvbHZlKCk7XHJcbiAgICAgICAgaWYgKGVudi5oYXNFcnJvcikgdGhyb3cgZW52LmVycm9yO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG5leHQoKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fcmV3cml0ZVJlbGF0aXZlSW1wb3J0RXh0ZW5zaW9uKHBhdGgsIHByZXNlcnZlSnN4KSB7XHJcbiAgICBpZiAodHlwZW9mIHBhdGggPT09IFwic3RyaW5nXCIgJiYgL15cXC5cXC4/XFwvLy50ZXN0KHBhdGgpKSB7XHJcbiAgICAgICAgcmV0dXJuIHBhdGgucmVwbGFjZSgvXFwuKHRzeCkkfCgoPzpcXC5kKT8pKCg/OlxcLlteLi9dKz8pPylcXC4oW2NtXT8pdHMkL2ksIGZ1bmN0aW9uIChtLCB0c3gsIGQsIGV4dCwgY20pIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRzeCA/IHByZXNlcnZlSnN4ID8gXCIuanN4XCIgOiBcIi5qc1wiIDogZCAmJiAoIWV4dCB8fCAhY20pID8gbSA6IChkICsgZXh0ICsgXCIuXCIgKyBjbS50b0xvd2VyQ2FzZSgpICsgXCJqc1wiKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHJldHVybiBwYXRoO1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCB7XHJcbiAgICBfX2V4dGVuZHM6IF9fZXh0ZW5kcyxcclxuICAgIF9fYXNzaWduOiBfX2Fzc2lnbixcclxuICAgIF9fcmVzdDogX19yZXN0LFxyXG4gICAgX19kZWNvcmF0ZTogX19kZWNvcmF0ZSxcclxuICAgIF9fcGFyYW06IF9fcGFyYW0sXHJcbiAgICBfX2VzRGVjb3JhdGU6IF9fZXNEZWNvcmF0ZSxcclxuICAgIF9fcnVuSW5pdGlhbGl6ZXJzOiBfX3J1bkluaXRpYWxpemVycyxcclxuICAgIF9fcHJvcEtleTogX19wcm9wS2V5LFxyXG4gICAgX19zZXRGdW5jdGlvbk5hbWU6IF9fc2V0RnVuY3Rpb25OYW1lLFxyXG4gICAgX19tZXRhZGF0YTogX19tZXRhZGF0YSxcclxuICAgIF9fYXdhaXRlcjogX19hd2FpdGVyLFxyXG4gICAgX19nZW5lcmF0b3I6IF9fZ2VuZXJhdG9yLFxyXG4gICAgX19jcmVhdGVCaW5kaW5nOiBfX2NyZWF0ZUJpbmRpbmcsXHJcbiAgICBfX2V4cG9ydFN0YXI6IF9fZXhwb3J0U3RhcixcclxuICAgIF9fdmFsdWVzOiBfX3ZhbHVlcyxcclxuICAgIF9fcmVhZDogX19yZWFkLFxyXG4gICAgX19zcHJlYWQ6IF9fc3ByZWFkLFxyXG4gICAgX19zcHJlYWRBcnJheXM6IF9fc3ByZWFkQXJyYXlzLFxyXG4gICAgX19zcHJlYWRBcnJheTogX19zcHJlYWRBcnJheSxcclxuICAgIF9fYXdhaXQ6IF9fYXdhaXQsXHJcbiAgICBfX2FzeW5jR2VuZXJhdG9yOiBfX2FzeW5jR2VuZXJhdG9yLFxyXG4gICAgX19hc3luY0RlbGVnYXRvcjogX19hc3luY0RlbGVnYXRvcixcclxuICAgIF9fYXN5bmNWYWx1ZXM6IF9fYXN5bmNWYWx1ZXMsXHJcbiAgICBfX21ha2VUZW1wbGF0ZU9iamVjdDogX19tYWtlVGVtcGxhdGVPYmplY3QsXHJcbiAgICBfX2ltcG9ydFN0YXI6IF9faW1wb3J0U3RhcixcclxuICAgIF9faW1wb3J0RGVmYXVsdDogX19pbXBvcnREZWZhdWx0LFxyXG4gICAgX19jbGFzc1ByaXZhdGVGaWVsZEdldDogX19jbGFzc1ByaXZhdGVGaWVsZEdldCxcclxuICAgIF9fY2xhc3NQcml2YXRlRmllbGRTZXQ6IF9fY2xhc3NQcml2YXRlRmllbGRTZXQsXHJcbiAgICBfX2NsYXNzUHJpdmF0ZUZpZWxkSW46IF9fY2xhc3NQcml2YXRlRmllbGRJbixcclxuICAgIF9fYWRkRGlzcG9zYWJsZVJlc291cmNlOiBfX2FkZERpc3Bvc2FibGVSZXNvdXJjZSxcclxuICAgIF9fZGlzcG9zZVJlc291cmNlczogX19kaXNwb3NlUmVzb3VyY2VzLFxyXG4gICAgX19yZXdyaXRlUmVsYXRpdmVJbXBvcnRFeHRlbnNpb246IF9fcmV3cml0ZVJlbGF0aXZlSW1wb3J0RXh0ZW5zaW9uLFxyXG59O1xyXG4iLCJleHBvcnQgdHlwZSBMaW5rSGludFR5cGUgPSAnaW50ZXJuYWwnIHwgJ2V4dGVybmFsJyB8ICdyZWdleCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTGlua0hpbnRCYXNlIHtcblx0bGV0dGVyOiBzdHJpbmc7XG5cdHR5cGU6IExpbmtIaW50VHlwZTtcblx0bGlua1RleHQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcmV2aWV3TGlua0hpbnQgZXh0ZW5kcyBMaW5rSGludEJhc2Uge1xuXHRsaW5rRWxlbWVudDogSFRNTEVsZW1lbnRcblx0bGVmdDogbnVtYmVyO1xuXHR0b3A6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTb3VyY2VMaW5rSGludCBleHRlbmRzIExpbmtIaW50QmFzZSB7XG5cdGluZGV4OiBudW1iZXJcbn1cblxuZXhwb3J0IGNsYXNzIFNldHRpbmdzIHtcblx0Ly8gRGVmYXVsdHMgYXMgaW4gVmltaXVtIGV4dGVuc2lvbiBmb3IgYnJvd3NlcnNcblx0bGV0dGVyczogc3RyaW5nID0gJ3NhZGZqa2xld2NtcGdoJztcblx0anVtcFRvQW55d2hlcmVSZWdleDogc3RyaW5nID0gJ1xcXFxiXFxcXHd7Myx9XFxcXGInO1xuXHRsaWdodHNwZWVkQ2FzZVNlbnNpdGl2ZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRqdW1wVG9MaW5rSWZPbmVMaW5rT25seTogYm9vbGVhbiA9IHRydWU7XG5cdGxpZ2h0c3BlZWRKdW1wVG9TdGFydE9mV29yZDogYm9vbGVhbiA9IHRydWU7XG5cdGxpZ2h0c3BlZWRDaGFyYWN0ZXJDb3VudDogbnVtYmVyID0gMjtcbn1cblxuZXhwb3J0IGNsYXNzIFByb2Nlc3NvciB7XG5cdGxldHRlcnM6IHN0cmluZztcblxuXHRwdWJsaWMgaW5pdDogKCkgPT4gTGlua0hpbnRCYXNlW107XG59XG4iLCJpbXBvcnQge1dpZGdldFR5cGV9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmV4cG9ydCBjbGFzcyBNYXJrV2lkZ2V0IGV4dGVuZHMgV2lkZ2V0VHlwZSB7XG4gICAgY29uc3RydWN0b3IocmVhZG9ubHkgbWFyazogc3RyaW5nLCByZWFkb25seSB0eXBlOiBzdHJpbmcsIHJlYWRvbmx5IG1hdGNoZWRFdmVudEtleTogc3RyaW5nKSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgfVxuXG4gICAgZXEob3RoZXI6IE1hcmtXaWRnZXQpIHtcbiAgICAgICAgcmV0dXJuIG90aGVyLm1hcmsgPT09IHRoaXMubWFyayAmJiBvdGhlci5tYXRjaGVkRXZlbnRLZXkgPT0gdGhpcy5tYXRjaGVkRXZlbnRLZXk7XG4gICAgfVxuXG4gICAgdG9ET00oKSB7XG4gICAgICAgIGNvbnN0IG1hcmsgPSBhY3RpdmVEb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICAgICAgbWFyay5pbm5lclRleHQgPSB0aGlzLm1hcms7XG5cbiAgICAgICAgY29uc3Qgd3JhcHBlciA9IGFjdGl2ZURvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHdyYXBwZXIuc3R5bGUuZGlzcGxheSA9IFwiaW5saW5lLWJsb2NrXCI7XG4gICAgICAgIHdyYXBwZXIuc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XG4gICAgICAgIHdyYXBwZXIuY2xhc3NMaXN0LmFkZCgnamwnKTtcbiAgICAgICAgd3JhcHBlci5jbGFzc0xpc3QuYWRkKCdqbC0nICsgdGhpcy50eXBlKTtcbiAgICAgICAgd3JhcHBlci5jbGFzc0xpc3QuYWRkKCdwb3BvdmVyJyk7XG4gICAgICAgIGlmICh0aGlzLm1hdGNoZWRFdmVudEtleSAmJiB0aGlzLm1hcmsudG9VcHBlckNhc2UoKS5zdGFydHNXaXRoKHRoaXMubWF0Y2hlZEV2ZW50S2V5LnRvVXBwZXJDYXNlKCkpKSB7XG4gICAgICAgICAgICB3cmFwcGVyLmNsYXNzTGlzdC5hZGQoJ21hdGNoZWQnKTtcbiAgICAgICAgfVxuICAgICAgICB3cmFwcGVyLmFwcGVuZChtYXJrKTtcblxuICAgICAgICByZXR1cm4gd3JhcHBlcjtcbiAgICB9XG5cbiAgICBpZ25vcmVFdmVudCgpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cbiIsImltcG9ydCB7XG4gICAgRGVjb3JhdGlvbixcbiAgICBEZWNvcmF0aW9uU2V0LFxuICAgIEVkaXRvclZpZXcsXG4gICAgVmlld1VwZGF0ZSxcbn0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcbmltcG9ydCB7IE1hcmtXaWRnZXQgfSBmcm9tIFwiLi9NYXJrV2lkZ2V0XCI7XG5pbXBvcnQge1NvdXJjZUxpbmtIaW50fSBmcm9tIFwiLi4vLi4vdHlwZXNcIjtcblxuZXhwb3J0IGNsYXNzIE1hcmtQbHVnaW4ge1xuICAgIGRlY29yYXRpb25zOiBEZWNvcmF0aW9uU2V0O1xuICAgIGxpbmtzOiBTb3VyY2VMaW5rSGludFtdID0gW107XG4gICAgbWF0Y2hlZEV2ZW50S2V5OiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cbiAgICBjb25zdHJ1Y3RvcihfdmlldzogRWRpdG9yVmlldykge1xuICAgICAgICB0aGlzLmxpbmtzID0gW107XG4gICAgICAgIHRoaXMubWF0Y2hlZEV2ZW50S2V5ID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLmRlY29yYXRpb25zID0gRGVjb3JhdGlvbi5ub25lXG4gICAgfVxuXG4gICAgc2V0TGlua3MobGlua3M6IFNvdXJjZUxpbmtIaW50W10pIHtcbiAgICAgICAgdGhpcy5saW5rcyA9IGxpbmtzO1xuICAgICAgICB0aGlzLm1hdGNoZWRFdmVudEtleSA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjbGVhbigpIHtcbiAgICAgICAgdGhpcy5saW5rcyA9IFtdO1xuICAgICAgICB0aGlzLm1hdGNoZWRFdmVudEtleSA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBmaWx0ZXJXaXRoRXZlbnRLZXkoZXZlbnRLZXk6IHN0cmluZykge1xuICAgICAgICBpZiAoZXZlbnRLZXkubGVuZ3RoICE9IDEpIHJldHVybjtcblxuICAgICAgICB0aGlzLmxpbmtzID0gdGhpcy5saW5rcy5maWx0ZXIodiA9PiB7XG4gICAgICAgICAgICByZXR1cm4gdi5sZXR0ZXIubGVuZ3RoID09IDIgJiYgdi5sZXR0ZXJbMF0udG9VcHBlckNhc2UoKSA9PSBldmVudEtleS50b1VwcGVyQ2FzZSgpXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMubWF0Y2hlZEV2ZW50S2V5ID0gZXZlbnRLZXk7XG4gICAgfVxuXG4gICAgZ2V0IHZpc2libGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxpbmtzLmxlbmd0aCA+IDA7XG4gICAgfVxuXG4gICAgdXBkYXRlKF91cGRhdGU6IFZpZXdVcGRhdGUpIHtcbiAgICAgICAgY29uc3Qgd2lkZ2V0cyA9IHRoaXMubGlua3MubWFwKCh4KSA9PlxuICAgICAgICAgICAgRGVjb3JhdGlvbi53aWRnZXQoe1xuICAgICAgICAgICAgICAgIHdpZGdldDogbmV3IE1hcmtXaWRnZXQoeC5sZXR0ZXIsIHgudHlwZSwgdGhpcy5tYXRjaGVkRXZlbnRLZXkpLFxuICAgICAgICAgICAgICAgIHNpZGU6IDEsXG4gICAgICAgICAgICB9KS5yYW5nZSh4LmluZGV4KVxuICAgICAgICApO1xuXG4gICAgICAgIHRoaXMuZGVjb3JhdGlvbnMgPSBEZWNvcmF0aW9uLnNldCh3aWRnZXRzKVxuICAgIH1cbn1cblxuIiwiaW1wb3J0IHtFZGl0b3J9IGZyb20gXCJjb2RlbWlycm9yXCI7XG5pbXBvcnQge1NvdXJjZUxpbmtIaW50fSBmcm9tIFwiLi4vLi4vdHlwZXNcIjtcblxuLyoqXG4gKiBHZXQgb25seSB2aXNpYmxlIGNvbnRlbnRcbiAqIEBwYXJhbSBjbUVkaXRvclxuICogQHJldHVybnMgTGV0dGVyIG9mZnNldCBhbmQgdmlzaWJsZSBjb250ZW50IGFzIGEgc3RyaW5nXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRWaXNpYmxlTGluZVRleHQoY21FZGl0b3I6IEVkaXRvcik6IHsgaW5kT2Zmc2V0OiBudW1iZXIsIHN0cnM6IHN0cmluZyB9IHtcbiAgICBjb25zdCBzY3JvbGxJbmZvID0gY21FZGl0b3IuZ2V0U2Nyb2xsSW5mbygpO1xuICAgIGNvbnN0IHsgbGluZTogZnJvbSB9ID0gY21FZGl0b3IuY29vcmRzQ2hhcih7IGxlZnQ6IDAsIHRvcDogMCB9LCAncGFnZScpO1xuICAgIGNvbnN0IHsgbGluZTogdG8gfSA9IGNtRWRpdG9yLmNvb3Jkc0NoYXIoeyBsZWZ0OiBzY3JvbGxJbmZvLmxlZnQsIHRvcDogc2Nyb2xsSW5mby50b3AgKyBzY3JvbGxJbmZvLmhlaWdodH0pXG4gICAgY29uc3QgaW5kT2Zmc2V0ID0gY21FZGl0b3IuaW5kZXhGcm9tUG9zKHtjaDowLCBsaW5lOiBmcm9tfSlcbiAgICBjb25zdCBzdHJzID0gY21FZGl0b3IuZ2V0UmFuZ2Uoe2NoOiAwLCBsaW5lOiBmcm9tfSwge2NoOiAwLCBsaW5lOiB0byArIDF9KVxuXG4gICAgcmV0dXJuIHsgaW5kT2Zmc2V0LCBzdHJzIH07XG59XG5cbi8qKlxuICpcbiAqIEBwYXJhbSBhbHBoYWJldCAtIExldHRlcnMgd2hpY2ggdXNlZCB0byBwcm9kdWNlIGhpbnRzXG4gKiBAcGFyYW0gbnVtTGlua0hpbnRzIC0gQ291bnQgb2YgbmVlZGVkIGxpbmtzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRMaW5rSGludExldHRlcnMoYWxwaGFiZXQ6IHN0cmluZywgbnVtTGlua0hpbnRzOiBudW1iZXIpOiBzdHJpbmdbXSB7XG4gICAgY29uc3QgYWxwaGFiZXRVcHBlcmNhc2UgPSBhbHBoYWJldC50b1VwcGVyQ2FzZSgpXG5cbiAgICBsZXQgcHJlZml4Q291bnQgPSBNYXRoLmNlaWwoKG51bUxpbmtIaW50cyAtIGFscGhhYmV0VXBwZXJjYXNlLmxlbmd0aCkgLyAoYWxwaGFiZXRVcHBlcmNhc2UubGVuZ3RoIC0gMSkpXG5cbiAgICAvLyBlbnN1cmUgMCA8PSBwcmVmaXhDb3VudCA8PSBhbHBoYWJldC5sZW5ndGhcbiAgICBwcmVmaXhDb3VudCA9IE1hdGgubWF4KHByZWZpeENvdW50LCAwKTtcbiAgICBwcmVmaXhDb3VudCA9IE1hdGgubWluKHByZWZpeENvdW50LCBhbHBoYWJldFVwcGVyY2FzZS5sZW5ndGgpO1xuXG4gICAgY29uc3QgcHJlZml4ZXMgPSBbJycsIC4uLkFycmF5LmZyb20oYWxwaGFiZXRVcHBlcmNhc2Uuc2xpY2UoMCwgcHJlZml4Q291bnQpKV07XG5cbiAgICBjb25zdCBsaW5rSGludExldHRlcnMgPSBbXVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcHJlZml4ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgcHJlZml4ID0gcHJlZml4ZXNbaV1cbiAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBhbHBoYWJldFVwcGVyY2FzZS5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgaWYgKGxpbmtIaW50TGV0dGVycy5sZW5ndGggPCBudW1MaW5rSGludHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsZXR0ZXIgPSBhbHBoYWJldFVwcGVyY2FzZVtqXTtcbiAgICAgICAgICAgICAgICBpZiAocHJlZml4ID09PSAnJykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXByZWZpeGVzLmNvbnRhaW5zKGxldHRlcikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmtIaW50TGV0dGVycy5wdXNoKGxldHRlcik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBsaW5rSGludExldHRlcnMucHVzaChwcmVmaXggKyBsZXR0ZXIpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBsaW5rSGludExldHRlcnM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNREhpbnRMaW5rcyhjb250ZW50OiBzdHJpbmcsIG9mZnNldDogbnVtYmVyLCBsZXR0ZXJzOiBzdHJpbmcpOiBTb3VyY2VMaW5rSGludFtdIHtcbiAgICAvLyBleHBlY3RpbmcgZWl0aGVyIFtbTGlua11dIG9yIFtbTGlua3xUaXRsZV1dXG4gICAgY29uc3QgcmVnRXhJbnRlcm5hbCA9IC9cXFtcXFsoLis/KShcXHwuKz8pP11dL2c7XG4gICAgLy8gZXhwZWN0aW5nIFtUaXRsZV0oLi4vZXhhbXBsZS5tZClcbiAgICBjb25zdCByZWdFeE1kSW50ZXJuYWwgPSAvXFxbW15cXFtcXF1dKz9cXF1cXCgoKFxcLlxcLnxcXHd8XFxkKS4rPylcXCkvZztcbiAgICAvLyBleHBlY3RpbmcgW1RpdGxlXShmaWxlOi8vbGluayksIFtUaXRsZV0oaHR0cHM6Ly9saW5rKSBvciBhbnkgb3RoZXIgW0ppcmEtMTIzXShqaXJhOi8vYmxhLWJsYSkgbGlua1xuICAgIGNvbnN0IHJlZ0V4RXh0ZXJuYWwgPSAvXFxbW15cXFtcXF1dKz9cXF1cXCgoLis/OlxcL1xcLy4rPylcXCkvZztcbiAgICAvLyBleHBlY3RpbmcgaHR0cDovL2hvZ2Vob2dlIG9yIGh0dHBzOi8vaG9nZWhvZ2VcbiAgICBjb25zdCByZWdFeFVybCA9IC8oIHxcXG58XikoaHR0cHM/OlxcL1xcL1teIFxcbl0rKS9nO1xuXG4gICAgdHlwZSBJbmRleGVkTGluayA9IHsgaW5kZXg6IG51bWJlciwgdHlwZTogJ2ludGVybmFsJyB8ICdleHRlcm5hbCcsIGxpbmtUZXh0OiBzdHJpbmcgfVxuICAgIGxldCBpbmRleGVzID0gbmV3IFNldDxudW1iZXI+KClcbiAgICBsZXQgbGlua3NXaXRoSW5kZXg6IEluZGV4ZWRMaW5rW10gPSBbXTtcbiAgICBsZXQgcmVnRXhSZXN1bHQ7XG5cbiAgICBjb25zdCBhZGRMaW5rVG9BcnJheSA9IChsaW5rOiBJbmRleGVkTGluaykgPT4ge1xuICAgICAgICBpZihpbmRleGVzLmhhcyhsaW5rLmluZGV4KSkgcmV0dXJuXG4gICAgICAgIGluZGV4ZXMuYWRkKGxpbmsuaW5kZXgpXG4gICAgICAgIGxpbmtzV2l0aEluZGV4LnB1c2gobGluaylcbiAgICB9XG5cbiAgICB3aGlsZShyZWdFeFJlc3VsdCA9IHJlZ0V4SW50ZXJuYWwuZXhlYyhjb250ZW50KSkge1xuICAgICAgICBjb25zdCBsaW5rVGV4dCA9IHJlZ0V4UmVzdWx0WzFdPy50cmltKCk7XG4gICAgICAgIGFkZExpbmtUb0FycmF5KHsgaW5kZXg6IHJlZ0V4UmVzdWx0LmluZGV4ICsgb2Zmc2V0LCB0eXBlOiAnaW50ZXJuYWwnLCBsaW5rVGV4dCB9KTtcbiAgICB9XG5cbiAgICAvLyBFeHRlcm5hbCBMaW5rIGFib3ZlIGludGVybmFsLCB0byBwcmVmZXIgdHlwZSBleHRlcm5hbCBvdmVyIGludGVyYWwgaW4gY2FzZSBvZiBhIGR1cGVcbiAgICB3aGlsZShyZWdFeFJlc3VsdCA9IHJlZ0V4RXh0ZXJuYWwuZXhlYyhjb250ZW50KSkge1xuICAgICAgICBjb25zdCBsaW5rVGV4dCA9IHJlZ0V4UmVzdWx0WzFdO1xuICAgICAgICBhZGRMaW5rVG9BcnJheSh7IGluZGV4OiByZWdFeFJlc3VsdC5pbmRleCArIG9mZnNldCwgdHlwZTogJ2V4dGVybmFsJywgbGlua1RleHQgfSlcbiAgICB9XG5cbiAgICB3aGlsZShyZWdFeFJlc3VsdCA9IHJlZ0V4TWRJbnRlcm5hbC5leGVjKGNvbnRlbnQpKSB7XG4gICAgICAgIGNvbnN0IGxpbmtUZXh0ID0gcmVnRXhSZXN1bHRbMV07XG4gICAgICAgIGFkZExpbmtUb0FycmF5KHsgaW5kZXg6IHJlZ0V4UmVzdWx0LmluZGV4ICsgb2Zmc2V0LCB0eXBlOiAnaW50ZXJuYWwnLCBsaW5rVGV4dCB9KTtcbiAgICB9XG5cbiAgICB3aGlsZShyZWdFeFJlc3VsdCA9IHJlZ0V4VXJsLmV4ZWMoY29udGVudCkpIHtcbiAgICAgICAgY29uc3QgbGlua1RleHQgPSByZWdFeFJlc3VsdFsyXTtcbiAgICAgICAgYWRkTGlua1RvQXJyYXkoeyBpbmRleDogcmVnRXhSZXN1bHQuaW5kZXggKyBvZmZzZXQgKyAxLCB0eXBlOiAnZXh0ZXJuYWwnLCBsaW5rVGV4dCB9KVxuICAgIH1cblxuICAgIGNvbnN0IGxpbmtIaW50TGV0dGVycyA9IGdldExpbmtIaW50TGV0dGVycyhsZXR0ZXJzLCBsaW5rc1dpdGhJbmRleC5sZW5ndGgpO1xuXG4gICAgY29uc3QgbGlua3NXaXRoTGV0dGVyOiBTb3VyY2VMaW5rSGludFtdID0gW107XG4gICAgbGlua3NXaXRoSW5kZXhcbiAgICAgICAgLnNvcnQoKHgseSkgPT4geC5pbmRleCAtIHkuaW5kZXgpXG4gICAgICAgIC5mb3JFYWNoKChsaW5rSGludCwgaSkgPT4ge1xuICAgICAgICAgICAgbGlua3NXaXRoTGV0dGVyLnB1c2goeyBsZXR0ZXI6IGxpbmtIaW50TGV0dGVyc1tpXSwgLi4ubGlua0hpbnR9KTtcbiAgICAgICAgfSk7XG5cbiAgICByZXR1cm4gbGlua3NXaXRoTGV0dGVyLmZpbHRlcihsaW5rID0+IGxpbmsubGV0dGVyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdpZGdldEVsZW1lbnQoY29udGVudDogc3RyaW5nLCB0eXBlOiBzdHJpbmcpIHtcbiAgICBjb25zdCBsaW5rSGludEVsID0gYWN0aXZlRG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgbGlua0hpbnRFbC5jbGFzc0xpc3QuYWRkKCdqbCcpO1xuICAgIGxpbmtIaW50RWwuY2xhc3NMaXN0LmFkZCgnamwtJyt0eXBlKTtcbiAgICBsaW5rSGludEVsLmNsYXNzTGlzdC5hZGQoJ3BvcG92ZXInKTtcbiAgICBsaW5rSGludEVsLmlubmVySFRNTCA9IGNvbnRlbnQ7XG4gICAgcmV0dXJuIGxpbmtIaW50RWw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkaXNwbGF5U291cmNlUG9wb3ZlcnMoY21FZGl0b3I6IEVkaXRvciwgbGlua0tleU1hcDogU291cmNlTGlua0hpbnRbXSk6IHZvaWQge1xuICAgIGNvbnN0IGRyYXdXaWRnZXQgPSAoY21FZGl0b3I6IEVkaXRvciwgbGlua0hpbnQ6IFNvdXJjZUxpbmtIaW50KSA9PiB7XG4gICAgICAgIGNvbnN0IHBvcyA9IGNtRWRpdG9yLnBvc0Zyb21JbmRleChsaW5rSGludC5pbmRleCk7XG4gICAgICAgIC8vIHRoZSBmb3VydGggcGFyYW1ldGVyIGlzIHVuZG9jdW1lbnRlZC4gaXQgc3BlY2lmaWVzIHdoZXJlIHRoZSB3aWRnZXQgc2hvdWxkIGJlIHBsYWNlXG4gICAgICAgIHJldHVybiAoY21FZGl0b3IgYXMgYW55KS5hZGRXaWRnZXQocG9zLCBjcmVhdGVXaWRnZXRFbGVtZW50KGxpbmtIaW50LmxldHRlciwgbGlua0hpbnQudHlwZSksIGZhbHNlLCAnb3ZlcicpO1xuICAgIH1cblxuICAgIGxpbmtLZXlNYXAuZm9yRWFjaCh4ID0+IGRyYXdXaWRnZXQoY21FZGl0b3IsIHgpKTtcbn1cblxuIiwiaW1wb3J0IHtQcm9jZXNzb3IsIFNvdXJjZUxpbmtIaW50fSBmcm9tIFwiLi4vLi4vdHlwZXNcIjtcbmltcG9ydCB7RWRpdG9yVmlld30gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcbmltcG9ydCB7Z2V0TURIaW50TGlua3N9IGZyb20gXCIuLi91dGlscy9jb21tb25cIjtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQ002TGlua1Byb2Nlc3NvciBpbXBsZW1lbnRzIFByb2Nlc3NvciB7XG4gICAgY21FZGl0b3I6IEVkaXRvclZpZXc7XG4gICAgbGV0dGVyczogc3RyaW5nO1xuXG4gICAgY29uc3RydWN0b3IoZWRpdG9yOiBFZGl0b3JWaWV3LCBhbHBoYWJldDogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuY21FZGl0b3IgPSBlZGl0b3I7XG4gICAgICAgIHRoaXMubGV0dGVycyA9IGFscGhhYmV0O1xuICAgIH1cblxuICAgIHB1YmxpYyBpbml0KCk6IFNvdXJjZUxpbmtIaW50W10ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRTb3VyY2VMaW5rSGludHMoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0VmlzaWJsZUxpbmVzKCkge1xuICAgICAgICBjb25zdCB7IGNtRWRpdG9yIH0gPSB0aGlzO1xuXG4gICAgICAgIGxldCB7IGZyb20sIHRvIH0gPSBjbUVkaXRvci52aWV3cG9ydDtcblxuICAgICAgICAvLyBGb3IgQ002IGdldCByZWFsIHZpc2libGUgbGluZXMgdG9wXG4gICAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgICAgaWYgKGNtRWRpdG9yLnZpZXdTdGF0ZT8ucGl4ZWxWaWV3cG9ydD8udG9wKSB7XG4gICAgICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgICAgICBjb25zdCBwaXhlbE9mZnNldFRvcCA9IGNtRWRpdG9yLnZpZXdTdGF0ZS5waXhlbFZpZXdwb3J0LnRvcFxuICAgICAgICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgICAgICAgY29uc3QgbGluZXMgPSBjbUVkaXRvci52aWV3U3RhdGUudmlld3BvcnRMaW5lc1xuXG4gICAgICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgICAgICBmcm9tID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZS50b3AgPiBwaXhlbE9mZnNldFRvcClbMF0/LmZyb21cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBjbUVkaXRvci5zdGF0ZS5zbGljZURvYyhmcm9tLCB0byk7XG5cbiAgICAgICAgcmV0dXJuIHsgaW5kZXg6IGZyb20sIGNvbnRlbnQgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFNvdXJjZUxpbmtIaW50cyA9ICgpOiBTb3VyY2VMaW5rSGludFtdID0+IHtcbiAgICAgICAgY29uc3QgeyBsZXR0ZXJzIH0gPSB0aGlzO1xuICAgICAgICBjb25zdCB7IGluZGV4LCBjb250ZW50IH0gPSB0aGlzLmdldFZpc2libGVMaW5lcygpO1xuXG4gICAgICAgIHJldHVybiBnZXRNREhpbnRMaW5rcyhjb250ZW50LCBpbmRleCwgbGV0dGVycyk7XG4gICAgfVxufSIsImltcG9ydCB7Z2V0TGlua0hpbnRMZXR0ZXJzfSBmcm9tIFwiLi9jb21tb25cIjtcbmltcG9ydCB7U291cmNlTGlua0hpbnR9IGZyb20gXCIuLi8uLi90eXBlc1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFJlZ2V4cEJsb2Nrcyhjb250ZW50OiBzdHJpbmcsIG9mZnNldDogbnVtYmVyLCByZWdleHA6IHN0cmluZywgbGV0dGVyczogc3RyaW5nLCBjYXNlU2Vuc2l0aXZlOiBib29sZWFuKSB7XG4gICAgY29uc3QgcmVnRXhVcmwgPSBjYXNlU2Vuc2l0aXZlID8gbmV3IFJlZ0V4cChyZWdleHAsICdnJykgOiBuZXcgUmVnRXhwKHJlZ2V4cCwgJ2lnJyk7XG5cbiAgICBsZXQgbGlua3NXaXRoSW5kZXg6IHtcbiAgICAgICAgaW5kZXg6IG51bWJlcjtcbiAgICAgICAgdHlwZTogXCJyZWdleFwiO1xuICAgICAgICBsaW5rVGV4dDogc3RyaW5nO1xuICAgIH1bXSA9IFtdO1xuXG4gICAgbGV0IHJlZ0V4UmVzdWx0O1xuXG4gICAgd2hpbGUgKChyZWdFeFJlc3VsdCA9IHJlZ0V4VXJsLmV4ZWMoY29udGVudCkpKSB7XG4gICAgICAgIGNvbnN0IGxpbmtUZXh0ID0gcmVnRXhSZXN1bHRbMV07XG4gICAgICAgIGxpbmtzV2l0aEluZGV4LnB1c2goe1xuICAgICAgICAgICAgaW5kZXg6IHJlZ0V4UmVzdWx0LmluZGV4ICsgb2Zmc2V0LFxuICAgICAgICAgICAgdHlwZTogXCJyZWdleFwiLFxuICAgICAgICAgICAgbGlua1RleHQsXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGxpbmtIaW50TGV0dGVycyA9IGdldExpbmtIaW50TGV0dGVycyhsZXR0ZXJzLCBsaW5rc1dpdGhJbmRleC5sZW5ndGgpO1xuXG4gICAgY29uc3QgbGlua3NXaXRoTGV0dGVyOiBTb3VyY2VMaW5rSGludFtdID0gW107XG4gICAgbGlua3NXaXRoSW5kZXhcbiAgICAgICAgLnNvcnQoKHgsIHkpID0+IHguaW5kZXggLSB5LmluZGV4KVxuICAgICAgICAuZm9yRWFjaCgobGlua0hpbnQsIGkpID0+IHtcbiAgICAgICAgICAgIGxpbmtzV2l0aExldHRlci5wdXNoKHtcbiAgICAgICAgICAgICAgICBsZXR0ZXI6IGxpbmtIaW50TGV0dGVyc1tpXSxcbiAgICAgICAgICAgICAgICAuLi5saW5rSGludCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgIHJldHVybiBsaW5rc1dpdGhMZXR0ZXIuZmlsdGVyKGxpbmsgPT4gbGluay5sZXR0ZXIpO1xufVxuIiwiaW1wb3J0IENNNkxpbmtQcm9jZXNzb3IgZnJvbSBcIi4vQ002TGlua1Byb2Nlc3NvclwiO1xuaW1wb3J0IHtQcm9jZXNzb3J9IGZyb20gXCIuLi8uLi90eXBlc1wiO1xuaW1wb3J0IHtFZGl0b3JWaWV3fSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuaW1wb3J0IHtleHRyYWN0UmVnZXhwQmxvY2tzfSBmcm9tIFwiLi4vdXRpbHMvcmVnZXhwXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIENNNlJlZ2V4UHJvY2Vzc29yIGV4dGVuZHMgQ002TGlua1Byb2Nlc3NvciBpbXBsZW1lbnRzIFByb2Nlc3NvciB7XG4gICAgcmVnZXhwOiBzdHJpbmc7XG4gICAgY2FzZVNlbnNpdGl2ZTogYm9vbGVhbjtcbiAgICBjb25zdHJ1Y3RvcihlZGl0b3I6IEVkaXRvclZpZXcsIGFscGhhYmV0OiBzdHJpbmcsIHJlZ2V4cDogc3RyaW5nLCBjYXNlU2Vuc2l0aXZlOiBib29sZWFuKSB7XG4gICAgICAgIHN1cGVyKGVkaXRvciwgYWxwaGFiZXQpO1xuICAgICAgICB0aGlzLnJlZ2V4cCA9IHJlZ2V4cDtcbiAgICAgICAgdGhpcy5jYXNlU2Vuc2l0aXZlID0gY2FzZVNlbnNpdGl2ZTtcbiAgICB9XG5cbiAgICBpbml0KCkge1xuICAgICAgICBjb25zdCB7IGxldHRlcnMsIHJlZ2V4cCB9ID0gdGhpcztcbiAgICAgICAgY29uc3QgeyBpbmRleCwgY29udGVudCB9ID0gdGhpcy5nZXRWaXNpYmxlTGluZXMoKTtcbiAgICAgICAgcmV0dXJuIGV4dHJhY3RSZWdleHBCbG9ja3MoY29udGVudCwgaW5kZXgsIHJlZ2V4cCwgbGV0dGVycywgdGhpcy5jYXNlU2Vuc2l0aXZlKTtcbiAgICB9XG59XG4iLCJpbXBvcnQge0VkaXRvcn0gZnJvbSBcImNvZGVtaXJyb3JcIjtcbmltcG9ydCB7UHJvY2Vzc29yLCBTb3VyY2VMaW5rSGludH0gZnJvbSBcIi4uLy4uL3R5cGVzXCI7XG5pbXBvcnQge2Rpc3BsYXlTb3VyY2VQb3BvdmVycywgZ2V0VmlzaWJsZUxpbmVUZXh0fSBmcm9tIFwiLi4vdXRpbHMvY29tbW9uXCI7XG5pbXBvcnQge2V4dHJhY3RSZWdleHBCbG9ja3N9IGZyb20gXCIuLi91dGlscy9yZWdleHBcIjtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTGVnYWN5UmVnZXhwUHJvY2Vzc29yIGltcGxlbWVudHMgUHJvY2Vzc29yIHtcbiAgICBjbUVkaXRvcjogRWRpdG9yO1xuICAgIHJlZ2V4cDogc3RyaW5nO1xuICAgIGxldHRlcnM6IHN0cmluZztcbiAgICBjYXNlU2Vuc2l0aXZlOiBib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3IoY21FZGl0b3I6IEVkaXRvciwgcmVnZXhwOiBzdHJpbmcsIGFscGhhYmV0OiBzdHJpbmcsIGNhc2VTZW5zaXRpdmU6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5jbUVkaXRvciA9IGNtRWRpdG9yO1xuICAgICAgICB0aGlzLnJlZ2V4cCA9IHJlZ2V4cDtcbiAgICAgICAgdGhpcy5sZXR0ZXJzID0gYWxwaGFiZXQ7XG4gICAgICAgIHRoaXMuY2FzZVNlbnNpdGl2ZSA9IGNhc2VTZW5zaXRpdmU7XG4gICAgfVxuXG4gICAgcHVibGljIGluaXQoKTogU291cmNlTGlua0hpbnRbXSB7XG4gICAgICAgIGNvbnN0IFtjb250ZW50LCBvZmZzZXRdID0gdGhpcy5nZXRWaXNpYmxlQ29udGVudCgpO1xuICAgICAgICBjb25zdCBsaW5rcyA9IHRoaXMuZ2V0TGlua3MoY29udGVudCwgb2Zmc2V0KTtcblxuICAgICAgICB0aGlzLmRpc3BsYXkobGlua3MpO1xuICAgICAgICByZXR1cm4gbGlua3M7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRWaXNpYmxlQ29udGVudCgpOiBbc3RyaW5nLCBudW1iZXJdIHtcbiAgICAgICAgY29uc3QgeyBjbUVkaXRvciB9ID0gdGhpcztcbiAgICAgICAgY29uc3QgeyBpbmRPZmZzZXQsIHN0cnMgfSA9IGdldFZpc2libGVMaW5lVGV4dChjbUVkaXRvcik7XG5cbiAgICAgICAgcmV0dXJuIFtzdHJzLCBpbmRPZmZzZXRdO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0TGlua3MoY29udGVudDogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IFNvdXJjZUxpbmtIaW50W10ge1xuICAgICAgICBjb25zdCB7IHJlZ2V4cCwgbGV0dGVycyB9ID0gdGhpc1xuICAgICAgICByZXR1cm4gZXh0cmFjdFJlZ2V4cEJsb2Nrcyhjb250ZW50LCBvZmZzZXQsIHJlZ2V4cCwgbGV0dGVycywgdGhpcy5jYXNlU2Vuc2l0aXZlKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGRpc3BsYXkobGlua3M6IFNvdXJjZUxpbmtIaW50W10pOiB2b2lkIHtcbiAgICAgICAgY29uc3QgeyBjbUVkaXRvciB9ID0gdGhpc1xuICAgICAgICBkaXNwbGF5U291cmNlUG9wb3ZlcnMoY21FZGl0b3IsIGxpbmtzKTtcbiAgICB9XG59XG4iLCJpbXBvcnQge1Byb2Nlc3NvciwgU291cmNlTGlua0hpbnR9IGZyb20gXCIuLi8uLi90eXBlc1wiO1xuaW1wb3J0IHtFZGl0b3J9IGZyb20gXCJjb2RlbWlycm9yXCI7XG5pbXBvcnQge2Rpc3BsYXlTb3VyY2VQb3BvdmVycywgZ2V0TURIaW50TGlua3MsIGdldFZpc2libGVMaW5lVGV4dH0gZnJvbSBcIi4uL3V0aWxzL2NvbW1vblwiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBMZWdhY3lTb3VyY2VMaW5rUHJvY2Vzc29yIGltcGxlbWVudHMgUHJvY2Vzc29yIHtcbiAgICBjbUVkaXRvcjogRWRpdG9yO1xuICAgIGxldHRlcnM6IHN0cmluZztcblxuICAgIGNvbnN0cnVjdG9yKGVkaXRvcjogRWRpdG9yLCBhbHBoYWJldDogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuY21FZGl0b3IgPSBlZGl0b3I7XG4gICAgICAgIHRoaXMubGV0dGVycyA9IGFscGhhYmV0O1xuICAgIH1cblxuICAgIHB1YmxpYyBpbml0KCkge1xuICAgICAgICBjb25zdCB7IGNtRWRpdG9yIH0gPSB0aGlzO1xuXG4gICAgICAgIGNvbnN0IGxpbmtIaW50cyA9IHRoaXMuZ2V0U291cmNlTGlua0hpbnRzKGNtRWRpdG9yKTtcbiAgICAgICAgZGlzcGxheVNvdXJjZVBvcG92ZXJzKGNtRWRpdG9yLCBsaW5rSGludHMpO1xuXG4gICAgICAgIHJldHVybiBsaW5rSGludHM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRTb3VyY2VMaW5rSGludHMgPSAoY21FZGl0b3I6IEVkaXRvcik6IFNvdXJjZUxpbmtIaW50W10gPT4ge1xuICAgICAgICBjb25zdCB7IGxldHRlcnMgfSA9IHRoaXM7XG4gICAgICAgIGNvbnN0IHsgaW5kT2Zmc2V0LCBzdHJzIH0gPSBnZXRWaXNpYmxlTGluZVRleHQoY21FZGl0b3IpO1xuXG4gICAgICAgIHJldHVybiBnZXRNREhpbnRMaW5rcyhzdHJzLCBpbmRPZmZzZXQsIGxldHRlcnMpO1xuICAgIH1cbn0iLCJpbXBvcnQge0xpbmtIaW50VHlwZSwgUHJldmlld0xpbmtIaW50fSBmcm9tIFwiLi4vLi4vdHlwZXNcIjtcbmltcG9ydCB7Z2V0TGlua0hpbnRMZXR0ZXJzfSBmcm9tIFwiLi9jb21tb25cIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldFByZXZpZXdMaW5rSGludHMocHJldmlld1ZpZXdFbDogSFRNTEVsZW1lbnQsIGxldHRlcnM6IHN0cmluZyApOiBQcmV2aWV3TGlua0hpbnRbXSB7XG4gICAgY29uc3QgYW5jaG9yRWxzID0gcHJldmlld1ZpZXdFbC5xdWVyeVNlbGVjdG9yQWxsKCdhLCAubWV0YWRhdGEtbGluay1pbm5lcicpO1xuICAgIGNvbnN0IGVtYmVkRWxzID0gcHJldmlld1ZpZXdFbC5xdWVyeVNlbGVjdG9yQWxsKCcuaW50ZXJuYWwtZW1iZWQnKTtcblxuICAgIGNvbnN0IGxpbmtIaW50czogUHJldmlld0xpbmtIaW50W10gPSBbXTtcbiAgICBhbmNob3JFbHMuZm9yRWFjaCgoYW5jaG9yRWwsIF9pKSA9PiB7XG4gICAgICAgIGlmIChjaGVja0lzUHJldmlld0VsT25TY3JlZW4ocHJldmlld1ZpZXdFbCwgYW5jaG9yRWwpKSB7XG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxpbmtUeXBlOiBMaW5rSGludFR5cGUgPSBhbmNob3JFbC5jbGFzc0xpc3QuY29udGFpbnMoJ2ludGVybmFsLWxpbmsnKVxuICAgICAgICAgICAgPyAnaW50ZXJuYWwnXG4gICAgICAgICAgICA6ICdleHRlcm5hbCc7XG5cbiAgICAgICAgY29uc3QgbGlua1RleHQgPSBsaW5rVHlwZSA9PT0gJ2ludGVybmFsJ1xuICAgICAgICAgICAgPyBhbmNob3JFbC5kYXRhc2V0WydocmVmJ10gPz8gYW5jaG9yRWwuaHJlZlxuICAgICAgICAgICAgOiBhbmNob3JFbC5ocmVmO1xuXG4gICAgICAgIGxldCBvZmZzZXRQYXJlbnQgPSBhbmNob3JFbC5vZmZzZXRQYXJlbnQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGxldCB0b3AgPSBhbmNob3JFbC5vZmZzZXRUb3A7XG4gICAgICAgIGxldCBsZWZ0ID0gYW5jaG9yRWwub2Zmc2V0TGVmdDtcblxuICAgICAgICB3aGlsZSAob2Zmc2V0UGFyZW50KSB7XG4gICAgICAgICAgICBpZiAob2Zmc2V0UGFyZW50ID09IHByZXZpZXdWaWV3RWwpIHtcbiAgICAgICAgICAgICAgICBvZmZzZXRQYXJlbnQgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRvcCArPSBvZmZzZXRQYXJlbnQub2Zmc2V0VG9wO1xuICAgICAgICAgICAgICAgIGxlZnQgKz0gb2Zmc2V0UGFyZW50Lm9mZnNldExlZnQ7XG4gICAgICAgICAgICAgICAgb2Zmc2V0UGFyZW50ID0gb2Zmc2V0UGFyZW50Lm9mZnNldFBhcmVudCBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBsaW5rSGludHMucHVzaCh7XG4gICAgICAgICAgICBsaW5rRWxlbWVudDogYW5jaG9yRWwsXG4gICAgICAgICAgICBsZXR0ZXI6ICcnLFxuICAgICAgICAgICAgbGlua1RleHQ6IGxpbmtUZXh0LFxuICAgICAgICAgICAgdHlwZTogbGlua1R5cGUsXG4gICAgICAgICAgICB0b3A6IHRvcCxcbiAgICAgICAgICAgIGxlZnQ6IGxlZnQsXG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgZW1iZWRFbHMuZm9yRWFjaCgoZW1iZWRFbCwgX2kpID0+IHtcbiAgICAgICAgY29uc3QgbGlua1RleHQgPSBlbWJlZEVsLmdldEF0dHJpYnV0ZSgnc3JjJyk7XG4gICAgICAgIGNvbnN0IGxpbmtFbCA9IGVtYmVkRWwucXVlcnlTZWxlY3RvcignLm1hcmtkb3duLWVtYmVkLWxpbmsnKSBhcyBIVE1MRWxlbWVudDtcblxuICAgICAgICBpZiAobGlua1RleHQgJiYgbGlua0VsKSB7XG4gICAgICAgICAgICBpZiAoY2hlY2tJc1ByZXZpZXdFbE9uU2NyZWVuKHByZXZpZXdWaWV3RWwsIGxpbmtFbCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGV0IG9mZnNldFBhcmVudCA9IGxpbmtFbC5vZmZzZXRQYXJlbnQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgICAgICBsZXQgdG9wID0gbGlua0VsLm9mZnNldFRvcDtcbiAgICAgICAgICAgIGxldCBsZWZ0ID0gbGlua0VsLm9mZnNldExlZnQ7XG5cbiAgICAgICAgICAgIHdoaWxlIChvZmZzZXRQYXJlbnQpIHtcbiAgICAgICAgICAgICAgICBpZiAob2Zmc2V0UGFyZW50ID09IHByZXZpZXdWaWV3RWwpIHtcbiAgICAgICAgICAgICAgICAgICAgb2Zmc2V0UGFyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRvcCArPSBvZmZzZXRQYXJlbnQub2Zmc2V0VG9wO1xuICAgICAgICAgICAgICAgICAgICBsZWZ0ICs9IG9mZnNldFBhcmVudC5vZmZzZXRMZWZ0O1xuICAgICAgICAgICAgICAgICAgICBvZmZzZXRQYXJlbnQgPSBvZmZzZXRQYXJlbnQub2Zmc2V0UGFyZW50IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGlua0hpbnRzLnB1c2goe1xuICAgICAgICAgICAgICAgIGxpbmtFbGVtZW50OiBsaW5rRWwsXG4gICAgICAgICAgICAgICAgbGV0dGVyOiAnJyxcbiAgICAgICAgICAgICAgICBsaW5rVGV4dDogbGlua1RleHQsXG4gICAgICAgICAgICAgICAgdHlwZTogJ2ludGVybmFsJyxcbiAgICAgICAgICAgICAgICB0b3A6IHRvcCxcbiAgICAgICAgICAgICAgICBsZWZ0OiBsZWZ0LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IHNvcnRlZExpbmtIaW50cyA9IGxpbmtIaW50cy5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgIGlmIChhLnRvcCA+IGIudG9wKSB7XG4gICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfSBlbHNlIGlmIChhLnRvcCA9PT0gYi50b3ApIHtcbiAgICAgICAgICAgIGlmIChhLmxlZnQgPiBiLmxlZnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYS5sZWZ0ID09PSBiLmxlZnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBsaW5rSGludExldHRlcnMgPSBnZXRMaW5rSGludExldHRlcnMobGV0dGVycywgc29ydGVkTGlua0hpbnRzLmxlbmd0aCk7XG5cbiAgICBzb3J0ZWRMaW5rSGludHMuZm9yRWFjaCgobGlua0hpbnQsIGkpID0+IHtcbiAgICAgICAgbGlua0hpbnQubGV0dGVyID0gbGlua0hpbnRMZXR0ZXJzW2ldO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHNvcnRlZExpbmtIaW50cztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrSXNQcmV2aWV3RWxPblNjcmVlbihwYXJlbnQ6IEhUTUxFbGVtZW50LCBlbDogSFRNTEVsZW1lbnQpIHtcbiAgICBlbCA9IGVsLmNsb3Nlc3QoJ1tkYXRhLXZpZXctdHlwZT1cInRhYmxlXCJdLCB0YWJsZScpIHx8IGVsO1xuICAgIHJldHVybiBlbC5vZmZzZXRUb3AgPCBwYXJlbnQuc2Nyb2xsVG9wIHx8IGVsLm9mZnNldFRvcCA+IHBhcmVudC5zY3JvbGxUb3AgKyBwYXJlbnQub2Zmc2V0SGVpZ2h0XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkaXNwbGF5UHJldmlld1BvcG92ZXJzKGxpbmtIaW50czogUHJldmlld0xpbmtIaW50W10pOiBIVE1MRWxlbWVudFtdIHtcbiAgICBjb25zdCBsaW5rSGludEh0bWxFbGVtZW50czogSFRNTEVsZW1lbnRbXSA9IFtdXG4gICAgZm9yIChsZXQgbGlua0hpbnQgb2YgbGlua0hpbnRzKSB7XG4gICAgICAgIGNvbnN0IHBvcG92ZXJFbGVtZW50ID0gbGlua0hpbnQubGlua0VsZW1lbnQuY3JlYXRlRWwoJ3NwYW4nKTtcbiAgICAgICAgbGlua0hpbnQubGlua0VsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnXG4gICAgICAgIHBvcG92ZXJFbGVtZW50LnN0eWxlLnRvcCA9ICcwcHgnO1xuICAgICAgICBwb3BvdmVyRWxlbWVudC5zdHlsZS5sZWZ0ID0gJzBweCc7XG4gICAgICAgIHBvcG92ZXJFbGVtZW50LnRleHRDb250ZW50ID0gbGlua0hpbnQubGV0dGVyO1xuICAgICAgICBwb3BvdmVyRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdqbCcpO1xuICAgICAgICBwb3BvdmVyRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdqbC0nK2xpbmtIaW50LnR5cGUpO1xuICAgICAgICBwb3BvdmVyRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdwb3BvdmVyJyk7XG4gICAgICAgIGxpbmtIaW50SHRtbEVsZW1lbnRzLnB1c2gocG9wb3ZlckVsZW1lbnQpXG4gICAgfVxuICAgIHJldHVybiBsaW5rSGludEh0bWxFbGVtZW50c1xufVxuXG4iLCJpbXBvcnQge1ByZXZpZXdMaW5rSGludH0gZnJvbSBcIi4uLy4uL3R5cGVzXCI7XG5pbXBvcnQge2Rpc3BsYXlQcmV2aWV3UG9wb3ZlcnMsIGdldFByZXZpZXdMaW5rSGludHN9IGZyb20gXCIuLi91dGlscy9wcmV2aWV3XCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFByZXZpZXdMaW5rUHJvY2Vzc29yIHtcbiAgICB2aWV3OiBIVE1MRWxlbWVudDtcbiAgICBhbHBoYWJldDogc3RyaW5nO1xuXG4gICAgY29uc3RydWN0b3IodmlldzogSFRNTEVsZW1lbnQsIGFscGhhYmV0OiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy52aWV3ID0gdmlldztcbiAgICAgICAgdGhpcy5hbHBoYWJldCA9IGFscGhhYmV0O1xuICAgIH1cblxuICAgIHB1YmxpYyBpbml0KCk6IFByZXZpZXdMaW5rSGludFtdIHtcbiAgICAgICAgY29uc3QgeyB2aWV3LCBhbHBoYWJldCB9ID0gdGhpc1xuICAgICAgICBjb25zdCBsaW5rcyA9IGdldFByZXZpZXdMaW5rSGludHModmlldywgYWxwaGFiZXQpO1xuICAgICAgICBkaXNwbGF5UHJldmlld1BvcG92ZXJzKGxpbmtzKTtcbiAgICAgICAgcmV0dXJuIGxpbmtzO1xuICAgIH1cbn0iLCJpbXBvcnQge1ByZXZpZXdMaW5rSGludCwgU291cmNlTGlua0hpbnR9IGZyb20gXCIuLi8uLi90eXBlc1wiO1xuaW1wb3J0IHtFZGl0b3JWaWV3fSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuaW1wb3J0IHtkaXNwbGF5UHJldmlld1BvcG92ZXJzLCBnZXRQcmV2aWV3TGlua0hpbnRzfSBmcm9tIFwiLi4vdXRpbHMvcHJldmlld1wiO1xuXG5pbXBvcnQge2dldExpbmtIaW50TGV0dGVycywgZ2V0TURIaW50TGlua3N9IGZyb20gXCIuLi91dGlscy9jb21tb25cIjtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTGl2ZVByZXZpZXdMaW5rUHJvY2Vzc29yIHtcbiAgICB2aWV3OiBIVE1MRWxlbWVudDtcbiAgICBjbUVkaXRvcjogRWRpdG9yVmlldztcbiAgICBhbHBoYWJldDogc3RyaW5nO1xuXG4gICAgY29uc3RydWN0b3IodmlldzogSFRNTEVsZW1lbnQsIGVkaXRvcjogRWRpdG9yVmlldywgYWxwaGFiZXQ6IHN0cmluZykge1xuICAgICAgICB0aGlzLnZpZXcgPSB2aWV3O1xuICAgICAgICB0aGlzLmNtRWRpdG9yID0gZWRpdG9yXG4gICAgICAgIHRoaXMuYWxwaGFiZXQgPSBhbHBoYWJldDtcbiAgICB9XG5cbiAgICBwdWJsaWMgaW5pdCgpOiBbUHJldmlld0xpbmtIaW50W10sU291cmNlTGlua0hpbnRbXSxIVE1MRWxlbWVudFtdXSB7XG4gICAgICAgIGNvbnN0IHsgdmlldywgYWxwaGFiZXQgfSA9IHRoaXNcbiAgICAgICAgY29uc3QgbGlua3MgPSBnZXRQcmV2aWV3TGlua0hpbnRzKHZpZXcsIGFscGhhYmV0KTtcbiAgICAgICAgY29uc3Qgc291cmNlTGlua3MgPSB0aGlzLmdldFNvdXJjZUxpbmtIaW50cygpO1xuICAgICAgICBjb25zdCBsaW5rSGludExldHRlcnMgPSBnZXRMaW5rSGludExldHRlcnMoYWxwaGFiZXQsIGxpbmtzLmxlbmd0aCArIHNvdXJjZUxpbmtzLmxlbmd0aCk7XG4gICAgICAgIGNvbnN0IGxpbmtzUmVtYXBwZWQgPSBsaW5rcy5tYXAoKGxpbmssIGlkeCkgPT4gKHsuLi5saW5rLCBsZXR0ZXI6IGxpbmtIaW50TGV0dGVyc1tpZHhdfSkpLmZpbHRlcihsaW5rID0+IGxpbmsubGV0dGVyKVxuICAgICAgICBjb25zdCBzb3VyY2VMaW5rc1JlbWFwcGVkID0gc291cmNlTGlua3MubWFwKChsaW5rLCBpZHgpID0+ICh7Li4ubGluaywgbGV0dGVyOiBsaW5rSGludExldHRlcnNbaWR4ICsgbGlua3MubGVuZ3RoXX0pKS5maWx0ZXIobGluayA9PiBsaW5rLmxldHRlcilcbiAgICAgICAgY29uc3QgbGlua0hpbnRIdG1sRWxlbWVudHMgPSBkaXNwbGF5UHJldmlld1BvcG92ZXJzKGxpbmtzUmVtYXBwZWQpO1xuICAgICAgICByZXR1cm4gW2xpbmtzUmVtYXBwZWQsIHNvdXJjZUxpbmtzUmVtYXBwZWQsIGxpbmtIaW50SHRtbEVsZW1lbnRzXTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0VmlzaWJsZUxpbmVzKCkge1xuICAgICAgICBjb25zdCB7IGNtRWRpdG9yIH0gPSB0aGlzO1xuICAgICAgICBsZXQgeyBmcm9tLCB0byB9ID0gY21FZGl0b3Iudmlld3BvcnQ7XG5cbiAgICAgICAgLy8gRm9yIENNNiBnZXQgcmVhbCB2aXNpYmxlIGxpbmVzIHRvcFxuICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgIGlmIChjbUVkaXRvci52aWV3U3RhdGU/LnBpeGVsVmlld3BvcnQ/LnRvcCkge1xuICAgICAgICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgICAgICAgY29uc3QgcGl4ZWxPZmZzZXRUb3AgPSBjbUVkaXRvci52aWV3U3RhdGUucGl4ZWxWaWV3cG9ydC50b3BcbiAgICAgICAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgICAgICAgIGNvbnN0IGxpbmVzID0gY21FZGl0b3Iudmlld1N0YXRlLnZpZXdwb3J0TGluZXNcbiAgICAgICAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgICAgICAgIGZyb20gPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lLnRvcCA+IHBpeGVsT2Zmc2V0VG9wKVswXT8uZnJvbVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBjbUVkaXRvci5zdGF0ZS5zbGljZURvYyhmcm9tLCB0byk7XG4gICAgICAgIHJldHVybiB7IGluZGV4OiBmcm9tLCBjb250ZW50IH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRTb3VyY2VMaW5rSGludHMgPSAoKTogU291cmNlTGlua0hpbnRbXSA9PiB7XG4gICAgICAgIGNvbnN0IHsgYWxwaGFiZXQgfSA9IHRoaXM7XG4gICAgICAgIGNvbnN0IHsgaW5kZXgsIGNvbnRlbnQgfSA9IHRoaXMuZ2V0VmlzaWJsZUxpbmVzKCk7XG5cbiAgICAgICAgcmV0dXJuIGdldE1ESGludExpbmtzKGNvbnRlbnQsIGluZGV4LCBhbHBoYWJldCk7XG4gICAgfVxufSIsImltcG9ydCB7QXBwLCBNYXJrZG93blZpZXcsIFBsdWdpbiwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZywgVmlldywgZWRpdG9yTGl2ZVByZXZpZXdGaWVsZH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHtFZGl0b3J9IGZyb20gJ29ic2lkaWFuJztcbmltcG9ydCB7RWRpdG9yU2VsZWN0aW9ufSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7RWRpdG9yVmlldywgVmlld1BsdWdpbiwgRGVjb3JhdGlvblNldH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcbmltcG9ydCB7TGlua0hpbnRCYXNlLCBTZXR0aW5ncywgU291cmNlTGlua0hpbnR9IGZyb20gJ3R5cGVzJztcbmltcG9ydCB7TWFya1BsdWdpbn0gZnJvbSBcIi4vY202LXdpZGdldC9NYXJrUGx1Z2luXCI7XG5cbmltcG9ydCBDTTZMaW5rUHJvY2Vzc29yIGZyb20gXCIuL3Byb2Nlc3NvcnMvQ002TGlua1Byb2Nlc3NvclwiO1xuaW1wb3J0IENNNlJlZ2V4UHJvY2Vzc29yIGZyb20gXCIuL3Byb2Nlc3NvcnMvQ002UmVnZXhQcm9jZXNzb3JcIjtcbmltcG9ydCBMZWdhY3lSZWdleHBQcm9jZXNzb3IgZnJvbSBcIi4vcHJvY2Vzc29ycy9MZWdhY3lSZWdleHBQcm9jZXNzb3JcIjtcbmltcG9ydCBMZWdhY3lTb3VyY2VMaW5rUHJvY2Vzc29yIGZyb20gXCIuL3Byb2Nlc3NvcnMvTGVnYWN5U291cmNlTGlua1Byb2Nlc3NvclwiO1xuaW1wb3J0IFByZXZpZXdMaW5rUHJvY2Vzc29yIGZyb20gXCIuL3Byb2Nlc3NvcnMvUHJldmlld0xpbmtQcm9jZXNzb3JcIjtcbmltcG9ydCBMaXZlUHJldmlld0xpbmtQcm9jZXNzb3IgZnJvbSAnLi9wcm9jZXNzb3JzL0xpdmVQcmV2aWV3TGlua1Byb2Nlc3Nvcic7XG5cbmVudW0gVklFV19NT0RFIHtcbiAgICBTT1VSQ0UsXG4gICAgUFJFVklFVyxcbiAgICBMRUdBQ1ksXG4gICAgTElWRV9QUkVWSUVXXG59XG5pbnRlcmZhY2UgQ3Vyc29yU3RhdGUge1xuICAgIHZpbU1vZGU/OiBzdHJpbmc7XG4gICAgYW5jaG9yPzogbnVtYmVyO1xufVxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgSnVtcFRvTGluayBleHRlbmRzIFBsdWdpbiB7XG4gICAgaXNMaW5rSGludEFjdGl2ZTogYm9vbGVhbiA9IGZhbHNlO1xuICAgIHNldHRpbmdzOiBTZXR0aW5ncztcbiAgICBwcmVmaXhJbmZvOiB7IHByZWZpeDogc3RyaW5nLCBzaGlmdEtleTogYm9vbGVhbiB9IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuICAgIG1hcmtWaWV3UGx1Z2luOiBWaWV3UGx1Z2luPGFueT5cbiAgICBjbUVkaXRvcjogRWRpdG9yIHwgRWRpdG9yVmlld1xuICAgIGN1cnJlbnRWaWV3OiBWaWV3XG4gICAgY29udGVudEVsZW1lbnQ6IEhUTUxFbGVtZW50XG4gICAgbW9kZTogVklFV19NT0RFXG4gICAgY3VycmVudEN1cnNvcjogQ3Vyc29yU3RhdGUgPSB7fTtcbiAgICBjdXJzb3JCZWZvcmVKdW1wOiBDdXJzb3JTdGF0ZSA9IHt9O1xuXG4gICAgYXN5bmMgb25sb2FkKCkge1xuICAgICAgICB0aGlzLnNldHRpbmdzID0gYXdhaXQgdGhpcy5sb2FkRGF0YSgpIHx8IG5ldyBTZXR0aW5ncygpO1xuXG4gICAgICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG4gICAgICAgIGNvbnN0IG1hcmtWaWV3UGx1Z2luID0gdGhpcy5tYXJrVmlld1BsdWdpbiA9IFZpZXdQbHVnaW4uZnJvbUNsYXNzKE1hcmtQbHVnaW4sIHtcbiAgICAgICAgICAgIGRlY29yYXRpb25zOiAodjogRGVjb3JhdGlvblNldCkgPT4gdi5kZWNvcmF0aW9uc1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihbbWFya1ZpZXdQbHVnaW5dKVxuXG4gICAgICAgIHRoaXMud2F0Y2hGb3JTZWxlY3Rpb25DaGFuZ2UoKTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6ICdhY3RpdmF0ZS1qdW1wLXRvLWxpbmsnLFxuICAgICAgICAgICAgbmFtZTogJ0p1bXAgdG8gTGluaycsXG4gICAgICAgICAgICBjYWxsYmFjazogdGhpcy5hY3Rpb24uYmluZCh0aGlzLCAnbGluaycpLFxuICAgICAgICAgICAgaG90a2V5czogW3ttb2RpZmllcnM6IFsnQ3RybCddLCBrZXk6IGAnYH1dLFxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6IFwiYWN0aXZhdGUtanVtcC10by1hbnl3aGVyZVwiLFxuICAgICAgICAgICAgbmFtZTogXCJKdW1wIHRvIEFueXdoZXJlIFJlZ2V4XCIsXG4gICAgICAgICAgICBjYWxsYmFjazogdGhpcy5hY3Rpb24uYmluZCh0aGlzLCAncmVnZXhwJyksXG4gICAgICAgICAgICBob3RrZXlzOiBbe21vZGlmaWVyczogW1wiQ3RybFwiXSwga2V5OiBcIjtcIn1dLFxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6IFwiYWN0aXZhdGUtbGlnaHRzcGVlZC1qdW1wXCIsXG4gICAgICAgICAgICBuYW1lOiBcIkxpZ2h0c3BlZWQgSnVtcFwiLFxuICAgICAgICAgICAgY2FsbGJhY2s6IHRoaXMuYWN0aW9uLmJpbmQodGhpcywgJ2xpZ2h0c3BlZWQnKSxcbiAgICAgICAgICAgIGhvdGtleXM6IFtdLFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBvbnVubG9hZCgpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ3VubG9hZGluZyBqdW1wIHRvIGxpbmtzIHBsdWdpbicpO1xuICAgIH1cblxuICAgIGFjdGlvbih0eXBlOiAnbGluaycgfCAncmVnZXhwJyB8ICdsaWdodHNwZWVkJykge1xuICAgICAgICBpZiAodGhpcy5pc0xpbmtIaW50QWN0aXZlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBhY3RpdmVWaWV3T2ZUeXBlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KVxuICAgICAgICBpZiAoIWFjdGl2ZVZpZXdPZlR5cGUpIHsgcmV0dXJuOyB9XG4gICAgICAgIGNvbnN0IGN1cnJlbnRWaWV3ID0gdGhpcy5jdXJyZW50VmlldyA9IGFjdGl2ZVZpZXdPZlR5cGUubGVhZi52aWV3O1xuICAgICAgICBjb25zdCBtb2RlID0gdGhpcy5tb2RlID0gdGhpcy5nZXRNb2RlKHRoaXMuY3VycmVudFZpZXcpO1xuICAgICAgICB0aGlzLmNvbnRlbnRFbGVtZW50ID0gYWN0aXZlVmlld09mVHlwZS5jb250ZW50RWxcbiAgICAgICAgdGhpcy5jdXJzb3JCZWZvcmVKdW1wID0gdGhpcy5jdXJyZW50Q3Vyc29yO1xuXG4gICAgICAgIHN3aXRjaCAobW9kZSkge1xuICAgICAgICAgICAgY2FzZSBWSUVXX01PREUuTEVHQUNZOlxuICAgICAgICAgICAgICAgIHRoaXMuY21FZGl0b3IgPSAoY3VycmVudFZpZXcgYXMgYW55KS5zb3VyY2VNb2RlLmNtRWRpdG9yO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBWSUVXX01PREUuTElWRV9QUkVWSUVXOlxuICAgICAgICAgICAgY2FzZSBWSUVXX01PREUuU09VUkNFOlxuICAgICAgICAgICAgICAgIHRoaXMuY21FZGl0b3IgPSAoPHsgZWRpdG9yPzogeyBjbTogRWRpdG9yVmlldyB9IH0+Y3VycmVudFZpZXcpLmVkaXRvci5jbTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSBcImxpbmtcIjpcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZUp1bXBUb0xpbmsoKTtcbiAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIGNhc2UgXCJyZWdleHBcIjpcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZUp1bXBUb1JlZ2V4KCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICBjYXNlIFwibGlnaHRzcGVlZFwiOlxuICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlTGlnaHRzcGVlZEp1bXAoKTtcbiAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldE1vZGUoY3VycmVudFZpZXc6IFZpZXcpOiBWSUVXX01PREUge1xuICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgIGNvbnN0IGlzTGVnYWN5ID0gdGhpcy5hcHAudmF1bHQuZ2V0Q29uZmlnKFwibGVnYWN5RWRpdG9yXCIpXG5cbiAgICAgICAgaWYgKGN1cnJlbnRWaWV3LmdldFN0YXRlKCkubW9kZSA9PT0gJ3ByZXZpZXcnKSB7XG4gICAgICAgICAgICByZXR1cm4gVklFV19NT0RFLlBSRVZJRVc7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNMZWdhY3kpIHtcbiAgICAgICAgICAgIHJldHVybiBWSUVXX01PREUuTEVHQUNZO1xuICAgICAgICB9IGVsc2UgaWYgKGN1cnJlbnRWaWV3LmdldFN0YXRlKCkubW9kZSA9PT0gJ3NvdXJjZScpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaXNMaXZlUHJldmlldyA9ICg8eyBlZGl0b3I/OiB7IGNtOiBFZGl0b3JWaWV3IH0gfT5jdXJyZW50VmlldykuZWRpdG9yLmNtLnN0YXRlPy5maWVsZChlZGl0b3JMaXZlUHJldmlld0ZpZWxkKVxuICAgICAgICAgICAgICAgIGlmIChpc0xpdmVQcmV2aWV3KSByZXR1cm4gVklFV19NT0RFLkxJVkVfUFJFVklFVztcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFZJRVdfTU9ERS5TT1VSQ0U7XG4gICAgICAgIH1cblxuICAgIH1cblxuICAgIGhhbmRsZUp1bXBUb0xpbmsgPSAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHtzZXR0aW5nczoge2xldHRlcnN9IH0gPSB0aGlzXG5cbiAgICAgICAgY29uc3QgeyBtb2RlLCBjdXJyZW50VmlldyB9ID0gdGhpcztcblxuICAgICAgICBzd2l0Y2ggKG1vZGUpIHtcbiAgICAgICAgICAgIGNhc2UgVklFV19NT0RFLkxFR0FDWToge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNtRWRpdG9yID0gdGhpcy5jbUVkaXRvciBhcyBFZGl0b3I7XG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlTGlua0hpbnRzID0gbmV3IExlZ2FjeVNvdXJjZUxpbmtQcm9jZXNzb3IoY21FZGl0b3IsIGxldHRlcnMpLmluaXQoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZUFjdGlvbnMoc291cmNlTGlua0hpbnRzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgVklFV19NT0RFLkxJVkVfUFJFVklFVzoge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNtNkVkaXRvciA9IHRoaXMuY21FZGl0b3IgYXMgRWRpdG9yVmlldztcbiAgICAgICAgICAgICAgICBjb25zdCBwcmV2aWV3Vmlld0VsOiBIVE1MRWxlbWVudCA9IChjdXJyZW50VmlldyBhcyBhbnkpLmN1cnJlbnRNb2RlLmVkaXRvci5jb250YWluZXJFbDtcbiAgICAgICAgICAgICAgICBjb25zdCBbcHJldmlld0xpbmtIaW50cywgc291cmNlTGlua0hpbnRzLCBsaW5rSGludEh0bWxFbGVtZW50c10gPSBuZXcgTGl2ZVByZXZpZXdMaW5rUHJvY2Vzc29yKHByZXZpZXdWaWV3RWwsIGNtNkVkaXRvciwgbGV0dGVycykuaW5pdCgpO1xuICAgICAgICAgICAgICAgIGNtNkVkaXRvci5wbHVnaW4odGhpcy5tYXJrVmlld1BsdWdpbikuc2V0TGlua3Moc291cmNlTGlua0hpbnRzKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFwcC53b3Jrc3BhY2UudXBkYXRlT3B0aW9ucygpO1xuICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlQWN0aW9ucyhbLi4ucHJldmlld0xpbmtIaW50cywgLi4uc291cmNlTGlua0hpbnRzXSwgbGlua0hpbnRIdG1sRWxlbWVudHMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBWSUVXX01PREUuUFJFVklFVzoge1xuICAgICAgICAgICAgICAgIGNvbnN0IHByZXZpZXdWaWV3RWw6IEhUTUxFbGVtZW50ID0gKGN1cnJlbnRWaWV3IGFzIGFueSkucHJldmlld01vZGUuY29udGFpbmVyRWwucXVlcnlTZWxlY3RvcignZGl2Lm1hcmtkb3duLXByZXZpZXctdmlldycpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHByZXZpZXdMaW5rSGludHMgPSBuZXcgUHJldmlld0xpbmtQcm9jZXNzb3IocHJldmlld1ZpZXdFbCwgbGV0dGVycykuaW5pdCgpO1xuICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlQWN0aW9ucyhwcmV2aWV3TGlua0hpbnRzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgVklFV19NT0RFLlNPVVJDRToge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNtNkVkaXRvciA9IHRoaXMuY21FZGl0b3IgYXMgRWRpdG9yVmlldztcbiAgICAgICAgICAgICAgICBjb25zdCBsaXZlUHJldmlld0xpbmtzID0gbmV3IENNNkxpbmtQcm9jZXNzb3IoY202RWRpdG9yLCBsZXR0ZXJzKS5pbml0KCk7XG4gICAgICAgICAgICAgICAgY202RWRpdG9yLnBsdWdpbih0aGlzLm1hcmtWaWV3UGx1Z2luKS5zZXRMaW5rcyhsaXZlUHJldmlld0xpbmtzKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFwcC53b3Jrc3BhY2UudXBkYXRlT3B0aW9ucygpO1xuICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlQWN0aW9ucyhsaXZlUHJldmlld0xpbmtzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qXG4gICAgKiAgY2FzZVNlbnNpdGl2ZSBpcyBvbmx5IGZvciBsaWdodHNwZWVkIGFuZCBzaGFsbCBub3QgYWZmZWN0IGp1bXBUb0FueXdoZXJlLCBzbyBpdCBpcyB0cnVlXG4gICAgKiAgYnkgZGVmYXVsdFxuICAgICovXG4gICAgaGFuZGxlSnVtcFRvUmVnZXggPSAoc3RyaW5nVG9TZWFyY2g/OiBzdHJpbmcsIGNhc2VTZW5zaXRpdmU6IGJvb2xlYW4gPSB0cnVlKSA9PiB7XG4gICAgICAgIGNvbnN0IHtzZXR0aW5nczoge2xldHRlcnMsIGp1bXBUb0FueXdoZXJlUmVnZXh9fSA9IHRoaXNcbiAgICAgICAgY29uc3Qgd2hhdFRvTG9va0F0ID0gc3RyaW5nVG9TZWFyY2ggfHwganVtcFRvQW55d2hlcmVSZWdleDtcblxuICAgICAgICBjb25zdCB7IG1vZGUgfSA9IHRoaXNcblxuICAgICAgICBzd2l0Y2ggKG1vZGUpIHtcbiAgICAgICAgICAgIGNhc2UgVklFV19NT0RFLlNPVVJDRTpcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZU1hcmtkb3duUmVnZXgobGV0dGVycywgd2hhdFRvTG9va0F0LCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgVklFV19NT0RFLkxJVkVfUFJFVklFVzpcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZU1hcmtkb3duUmVnZXgobGV0dGVycywgd2hhdFRvTG9va0F0LCBjYXNlU2Vuc2l0aXZlKTtcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSBWSUVXX01PREUuUFJFVklFVzpcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgVklFV19NT0RFLkxFR0FDWTpcbiAgICAgICAgICAgICAgICBjb25zdCBjbUVkaXRvciA9IHRoaXMuY21FZGl0b3IgYXMgRWRpdG9yXG4gICAgICAgICAgICAgICAgY29uc3QgbGlua3MgPSBuZXcgTGVnYWN5UmVnZXhwUHJvY2Vzc29yKGNtRWRpdG9yLCB3aGF0VG9Mb29rQXQsIGxldHRlcnMsIGNhc2VTZW5zaXRpdmUpLmluaXQoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZUFjdGlvbnMobGlua3MpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgfVxuXG4gICAgaGFuZGxlTWFya2Rvd25SZWdleCA9IChsZXR0ZXJzOiBzdHJpbmcsIHdoYXRUb0xvb2tBdDogc3RyaW5nLCBjYXNlU2Vuc2l0aXZlOiBib29sZWFuKSA9PiB7XG4gICAgICAgIGNvbnN0IGNtNkVkaXRvciA9IHRoaXMuY21FZGl0b3IgYXMgRWRpdG9yVmlld1xuICAgICAgICBjb25zdCBsaXZlUHJldmlld0xpbmtzID0gbmV3IENNNlJlZ2V4UHJvY2Vzc29yKGNtNkVkaXRvciwgbGV0dGVycywgd2hhdFRvTG9va0F0LCBjYXNlU2Vuc2l0aXZlKS5pbml0KCk7XG4gICAgICAgIGNtNkVkaXRvci5wbHVnaW4odGhpcy5tYXJrVmlld1BsdWdpbikuc2V0TGlua3MobGl2ZVByZXZpZXdMaW5rcyk7XG4gICAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS51cGRhdGVPcHRpb25zKCk7XG4gICAgICAgIHRoaXMuaGFuZGxlQWN0aW9ucyhsaXZlUHJldmlld0xpbmtzKTtcbiAgICB9XG5cbiAgICAvLyBhZGFwdGVkIGZyb206IGh0dHBzOi8vZ2l0aHViLmNvbS9tcmphY2twaGlsL29ic2lkaWFuLWp1bXAtdG8tbGluay9pc3N1ZXMvMzUjaXNzdWVjb21tZW50LTEwODU5MDU2NjhcbiAgICBoYW5kbGVMaWdodHNwZWVkSnVtcCgpIHtcbiAgICAgICAgLy8gZ2V0IGFsbCB0ZXh0IGNvbG9yXG4gICAgICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSBhcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcbiAgICAgICAgaWYgKCFjb250ZW50RWwpIHtyZXR1cm59XG5cbiAgICAgICAgLy8gdGhpcyBlbGVtZW50IGRvZXNuJ3QgZXhpc3QgaW4gY201L2hhcyBhIGRpZmZlcmVudCBjbGFzcywgc28gbGlnaHRzcGVlZCB3aWxsIG5vdCB3b3JrIGluIGNtNVxuICAgICAgICBjb25zdCBjb250ZW50Q29udGFpbmVyQ29sb3IgPSBjb250ZW50RWwuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZShcImNtLWNvbnRlbnRDb250YWluZXJcIik7XG4gICAgICAgIGNvbnN0IG9yaWdpbmFsQ29sb3IgPSAoY29udGVudENvbnRhaW5lckNvbG9yWzBdIGFzIEhUTUxFbGVtZW50KS5zdHlsZS5jb2xvcjtcblxuICAgICAgICAvLyBjaGFuZ2UgYWxsIHRleHQgY29sb3IgdG8gZ3JheVxuICAgICAgICAoY29udGVudENvbnRhaW5lckNvbG9yWzBdIGFzIEhUTUxFbGVtZW50KS5zdHlsZS5jb2xvciA9ICd2YXIoLS1qdW1wLXRvLWxpbmstbGlnaHRzcGVlZC1jb2xvciknO1xuXG4gICAgICAgIGNvbnN0IGtleUFycmF5OiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBjb25zdCBncmFiS2V5ID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgICAgICAgICAvLyBoYW5kbGUgRXNjYXBlIHRvIHJlamVjdCB0aGUgbW9kZVxuICAgICAgICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0VzY2FwZScpIHtcbiAgICAgICAgICAgICAgICBjb250ZW50RWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgZ3JhYktleSwgeyBjYXB0dXJlOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgIChjb250ZW50Q29udGFpbmVyQ29sb3JbMF0gYXMgSFRNTEVsZW1lbnQpLnN0eWxlLmNvbG9yID0gb3JpZ2luYWxDb2xvcjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gdGVzdCBpZiBrZXlwcmVzcyBpcyBjYXBpdGFsaXplZFxuICAgICAgICAgICAgaWYgKC9eW1xcd1xcU1xcV10kL2kudGVzdChldmVudC5rZXkpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaXNDYXBpdGFsID0gZXZlbnQuc2hpZnRLZXk7XG4gICAgICAgICAgICAgICAgaWYgKGlzQ2FwaXRhbCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBjYXB0dXJlIHVwcGVyY2FzZVxuICAgICAgICAgICAgICAgICAgICBrZXlBcnJheS5wdXNoKChldmVudC5rZXkpLnRvVXBwZXJDYXNlKCkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGNhcHR1cmUgbG93ZXJjYXNlXG4gICAgICAgICAgICAgICAgICAgIGtleUFycmF5LnB1c2goZXZlbnQua2V5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHN0b3Agd2hlbiBsZW5ndGggb2YgYXJyYXkgaXMgZXF1YWwgdG8gbGlnaHRzcGVlZENoYXJhY3RlckNvdW50XG4gICAgICAgICAgICBpZiAoa2V5QXJyYXkubGVuZ3RoID09PSB0aGlzLnNldHRpbmdzLmxpZ2h0c3BlZWRDaGFyYWN0ZXJDb3VudCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHN0cmluZ1RvU2VhcmNoID0gdGhpcy5zZXR0aW5ncy5saWdodHNwZWVkSnVtcFRvU3RhcnRPZldvcmQgPyBcIlxcXFxiXCIgKyBrZXlBcnJheS5qb2luKFwiXCIpIDoga2V5QXJyYXkuam9pbihcIlwiKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlSnVtcFRvUmVnZXgoc3RyaW5nVG9TZWFyY2gsIHRoaXMuc2V0dGluZ3MubGlnaHRzcGVlZENhc2VTZW5zaXRpdmUpO1xuXG4gICAgICAgICAgICAgICAgLy8gcmVtb3ZpbmcgZXZlbnRMaXN0ZW5lciBhZnRlciBwcm9jZWVkZWRcbiAgICAgICAgICAgICAgICBjb250ZW50RWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgZ3JhYktleSwgeyBjYXB0dXJlOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgIChjb250ZW50Q29udGFpbmVyQ29sb3JbMF0gYXMgSFRNTEVsZW1lbnQpLnN0eWxlLmNvbG9yID0gb3JpZ2luYWxDb2xvcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb250ZW50RWwuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGdyYWJLZXksIHsgY2FwdHVyZTogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICBoYW5kbGVIb3RrZXkoaGVsZFNoaWZ0S2V5OiBib29sZWFuLCBsaW5rOiBTb3VyY2VMaW5rSGludCB8IExpbmtIaW50QmFzZSkge1xuICAgICAgICBpZiAobGluay5saW5rRWxlbWVudCkge1xuICAgICAgICAgICAgY29uc3QgZXZlbnQgPSBuZXcgTW91c2VFdmVudChcImNsaWNrXCIsIHtcbiAgICAgICAgICAgICAgICBidWJibGVzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGNhbmNlbGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgdmlldzogd2luZG93LFxuICAgICAgICAgICAgICAgIG1ldGFLZXk6IGhlbGRTaGlmdEtleSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgbGluay5saW5rRWxlbWVudC5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcbiAgICAgICAgfSBlbHNlIGlmIChsaW5rLnR5cGUgPT09ICdpbnRlcm5hbCcpIHtcbiAgICAgICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpXG4gICAgICAgICAgICBpZiAoZmlsZSkge1xuICAgICAgICAgICAgICAgIC8vIHRoZSBzZWNvbmQgYXJndW1lbnQgaXMgZm9yIHRoZSBsaW5rIHJlc29sdXRpb25cbiAgICAgICAgICAgICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub3BlbkxpbmtUZXh0KGRlY29kZVVSSShsaW5rLmxpbmtUZXh0KSwgZmlsZS5wYXRoLCBoZWxkU2hpZnRLZXksIHthY3RpdmU6IHRydWV9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChsaW5rLnR5cGUgPT09ICdleHRlcm5hbCcpIHtcbiAgICAgICAgICAgIHdpbmRvdy5vcGVuKGxpbmsubGlua1RleHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgZWRpdG9yID0gdGhpcy5jbUVkaXRvcjtcbiAgICAgICAgICAgIGlmIChlZGl0b3IgaW5zdGFuY2VvZiBFZGl0b3JWaWV3KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW5kZXggPSAobGluayBhcyBTb3VyY2VMaW5rSGludCkuaW5kZXg7XG4gICAgICAgICAgICAgICAgY29uc3Qge3ZpbU1vZGUsIGFuY2hvcn0gPSB0aGlzLmN1cnNvckJlZm9yZUp1bXA7XG4gICAgICAgICAgICAgICAgY29uc3QgdXNlU2VsZWN0aW9uID0gaGVsZFNoaWZ0S2V5IHx8ICh2aW1Nb2RlID09PSAndmlzdWFsJyB8fCB2aW1Nb2RlID09PSAndmlzdWFsIGJsb2NrJylcblxuICAgICAgICAgICAgICAgIGlmICh1c2VTZWxlY3Rpb24gJiYgYW5jaG9yICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRpdG9yLmRpc3BhdGNoKHtzZWxlY3Rpb246IEVkaXRvclNlbGVjdGlvbi5yYW5nZShhbmNob3IsIGluZGV4KX0pXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZWRpdG9yLmRpc3BhdGNoKHsgc2VsZWN0aW9uOiBFZGl0b3JTZWxlY3Rpb24uY3Vyc29yKGluZGV4KSB9KVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnNldEN1cnNvcihlZGl0b3IucG9zRnJvbUluZGV4KCg8U291cmNlTGlua0hpbnQ+bGluaykuaW5kZXgpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlbW92ZVBvcG92ZXJzKGxpbmtIaW50SHRtbEVsZW1lbnRzOiBIVE1MRWxlbWVudFtdIHwgdW5kZWZpbmVkID0gW10pIHtcbiAgICAgICAgY29uc3QgY3VycmVudFZpZXcgPSB0aGlzLmNvbnRlbnRFbGVtZW50O1xuXG4gICAgICAgIGN1cnJlbnRWaWV3LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5yZW1vdmVQb3BvdmVycyhsaW5rSGludEh0bWxFbGVtZW50cykpXG4gICAgICAgIGxpbmtIaW50SHRtbEVsZW1lbnRzPy5mb3JFYWNoKGUgPT4gZS5yZW1vdmUoKSk7XG4gICAgICAgIGN1cnJlbnRWaWV3LnF1ZXJ5U2VsZWN0b3JBbGwoJy5qbC5wb3BvdmVyJykuZm9yRWFjaChlID0+IGUucmVtb3ZlKCkpO1xuXG4gICAgICAgIHRoaXMucHJlZml4SW5mbyA9IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKHRoaXMubW9kZSA9PSBWSUVXX01PREUuU09VUkNFIHx8IHRoaXMubW9kZSA9PSBWSUVXX01PREUuTElWRV9QUkVWSUVXKSB7XG4gICAgICAgICAgICAodGhpcy5jbUVkaXRvciBhcyBFZGl0b3JWaWV3KS5wbHVnaW4odGhpcy5tYXJrVmlld1BsdWdpbikuY2xlYW4oKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFwcC53b3Jrc3BhY2UudXBkYXRlT3B0aW9ucygpO1xuICAgICAgICB0aGlzLmlzTGlua0hpbnRBY3RpdmUgPSBmYWxzZTtcbiAgICB9XG5cbiAgICByZW1vdmVQb3BvdmVyc1dpdGhvdXRQcmVmaXhFdmVudEtleShldmVudEtleTogc3RyaW5nLCBsaW5rSGludEh0bWxFbGVtZW50czogSFRNTEVsZW1lbnRbXSB8IHVuZGVmaW5lZCA9IFtdKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRWaWV3ID0gdGhpcy5jb250ZW50RWxlbWVudDtcblxuICAgICAgICBsaW5rSGludEh0bWxFbGVtZW50cz8uZm9yRWFjaChlID0+IHtcbiAgICAgICAgICAgIGlmIChlLmlubmVySFRNTC5sZW5ndGggPT0gMiAmJiBlLmlubmVySFRNTFswXSA9PSBldmVudEtleSkge1xuICAgICAgICAgICAgICAgIGUuY2xhc3NMaXN0LmFkZChcIm1hdGNoZWRcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlLnJlbW92ZSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjdXJyZW50Vmlldy5xdWVyeVNlbGVjdG9yQWxsKCcuamwucG9wb3ZlcicpLmZvckVhY2goZSA9PiB7XG4gICAgICAgICAgICBpZiAoZS5pbm5lckhUTUwubGVuZ3RoID09IDIgJiYgZS5pbm5lckhUTUxbMF0gPT0gZXZlbnRLZXkpIHtcbiAgICAgICAgICAgICAgICBlLmNsYXNzTGlzdC5hZGQoXCJtYXRjaGVkXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZS5yZW1vdmUoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHRoaXMubW9kZSA9PSBWSUVXX01PREUuU09VUkNFIHx8IHRoaXMubW9kZSA9PSBWSUVXX01PREUuTElWRV9QUkVWSUVXKSB7XG4gICAgICAgICAgICAodGhpcy5jbUVkaXRvciBhcyBFZGl0b3JWaWV3KS5wbHVnaW4odGhpcy5tYXJrVmlld1BsdWdpbikuZmlsdGVyV2l0aEV2ZW50S2V5KGV2ZW50S2V5KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFwcC53b3Jrc3BhY2UudXBkYXRlT3B0aW9ucygpO1xuICAgIH1cblxuICAgIGhhbmRsZUFjdGlvbnMobGlua0hpbnRzOiBMaW5rSGludEJhc2VbXSwgbGlua0hpbnRIdG1sRWxlbWVudHM/OiBIVE1MRWxlbWVudFtdKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNvbnRlbnRFbGVtZW50ID0gdGhpcy5jb250ZW50RWxlbWVudFxuICAgICAgICBpZiAoIWxpbmtIaW50cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxpbmtIaW50TWFwOiB7IFtsZXR0ZXI6IHN0cmluZ106IExpbmtIaW50QmFzZSB9ID0ge307XG4gICAgICAgIGxpbmtIaW50cy5mb3JFYWNoKHggPT4gbGlua0hpbnRNYXBbeC5sZXR0ZXJdID0geCk7XG5cbiAgICAgICAgY29uc3QgaGFuZGxlS2V5RG93biA9IChldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgaWYgKFsnU2hpZnQnLCAnQ29udHJvbCcsICdDYXBzTG9jaycsICdTY3JvbGxMb2NrJywgJ0dyb3VwTmV4dCcsICdNZXRhJ10uaW5jbHVkZXMoZXZlbnQua2V5KSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgZXZlbnRLZXkgPSBldmVudC5rZXkudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIGNvbnN0IHByZWZpeGVzID0gbmV3IFNldChPYmplY3Qua2V5cyhsaW5rSGludE1hcCkuZmlsdGVyKHggPT4geC5sZW5ndGggPiAxKS5tYXAoeCA9PiB4WzBdKSk7XG5cbiAgICAgICAgICAgIGxldCBsaW5rSGludDogTGlua0hpbnRCYXNlO1xuICAgICAgICAgICAgaWYgKHRoaXMucHJlZml4SW5mbykge1xuICAgICAgICAgICAgICAgIGxpbmtIaW50ID0gbGlua0hpbnRNYXBbdGhpcy5wcmVmaXhJbmZvLnByZWZpeCArIGV2ZW50S2V5XTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGlua0hpbnQgPSBsaW5rSGludE1hcFtldmVudEtleV07XG4gICAgICAgICAgICAgICAgaWYgKCFsaW5rSGludCAmJiBwcmVmaXhlcyAmJiBwcmVmaXhlcy5oYXMoZXZlbnRLZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucHJlZml4SW5mbyA9IHtwcmVmaXg6IGV2ZW50S2V5LCBzaGlmdEtleTogZXZlbnQuc2hpZnRLZXl9O1xuXG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZVBvcG92ZXJzV2l0aG91dFByZWZpeEV2ZW50S2V5KGV2ZW50S2V5LCBsaW5rSGludEh0bWxFbGVtZW50cyk7XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cbiAgICAgICAgICAgIGNvbnN0IGhlbGRTaGlmdEtleSA9IHRoaXMucHJlZml4SW5mbz8uc2hpZnRLZXkgfHwgZXZlbnQuc2hpZnRLZXk7XG5cbiAgICAgICAgICAgIGxpbmtIaW50ICYmIHRoaXMuaGFuZGxlSG90a2V5KGhlbGRTaGlmdEtleSwgbGlua0hpbnQpO1xuXG4gICAgICAgICAgICB0aGlzLnJlbW92ZVBvcG92ZXJzKGxpbmtIaW50SHRtbEVsZW1lbnRzKTtcbiAgICAgICAgICAgIGNvbnRlbnRFbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVLZXlEb3duLCB7IGNhcHR1cmU6IHRydWUgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGxpbmtIaW50cy5sZW5ndGggPT09IDEgJiYgdGhpcy5zZXR0aW5ncy5qdW1wVG9MaW5rSWZPbmVMaW5rT25seSkge1xuICAgICAgICAgICAgY29uc3QgaGVsZFNoaWZ0S2V5ID0gdGhpcy5wcmVmaXhJbmZvPy5zaGlmdEtleTtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlSG90a2V5KGhlbGRTaGlmdEtleSwgbGlua0hpbnRzWzBdKTtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlUG9wb3ZlcnMobGlua0hpbnRIdG1sRWxlbWVudHMpO1xuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBjb250ZW50RWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMucmVtb3ZlUG9wb3ZlcnMobGlua0hpbnRIdG1sRWxlbWVudHMpKVxuICAgICAgICBjb250ZW50RWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlS2V5RG93biwgeyBjYXB0dXJlOiB0cnVlIH0pO1xuICAgICAgICB0aGlzLmlzTGlua0hpbnRBY3RpdmUgPSB0cnVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvZGVNaXJyb3IncyB2aW0gYXV0b21hdGljYWxseSBleGl0cyB2aXN1YWwgbW9kZSB3aGVuIGV4ZWN1dGluZyBhIGNvbW1hbmQuXG4gICAgICogVGhpcyBrZWVwcyB0cmFjayBvZiBzZWxlY3Rpb24gY2hhbmdlcyBzbyB3ZSBjYW4gcmVzdG9yZSB0aGUgc2VsZWN0aW9uLlxuICAgICAqXG4gICAgICogVGhpcyBpcyB0aGUgc2FtZSBhcHByb2FjaCB0YWtlbiBieSB0aGUgb2JzaWRpYW4tdmltcmMtcGx1Z2luXG4gICAgICovXG4gICAgd2F0Y2hGb3JTZWxlY3Rpb25DaGFuZ2UoKSB7XG4gICAgICAgIGNvbnN0IHVwZGF0ZVNlbGVjdGlvbiA9IHRoaXMudXBkYXRlU2VsZWN0aW9uLmJpbmQodGhpcylcbiAgICAgICAgY29uc3Qgd2F0Y2hGb3JDaGFuZ2VzID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZWRpdG9yID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KT8uZWRpdG9yO1xuICAgICAgICAgICAgY29uc3QgY206IEVkaXRvciB8IHVuZGVmaW5lZCA9IChlZGl0b3IgYXMgYW55KT8uY20/LmNtO1xuXG4gICAgICAgICAgICBpZiAoY20gJiYgIShjbSBhcyBhbnkpLl9oYW5kbGVycy5jdXJzb3JBY3Rpdml0eS5pbmNsdWRlcyh1cGRhdGVTZWxlY3Rpb24pKSB7XG4gICAgICAgICAgICAgICAgY20ub24oXCJjdXJzb3JBY3Rpdml0eVwiLCB1cGRhdGVTZWxlY3Rpb24pO1xuICAgICAgICAgICAgICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4gY20ub2ZmKFwiY3Vyc29yQWN0aXZpdHlcIiwgdXBkYXRlU2VsZWN0aW9uKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImFjdGl2ZS1sZWFmLWNoYW5nZVwiLCB3YXRjaEZvckNoYW5nZXMpKTtcbiAgICAgICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImZpbGUtb3BlblwiLCB3YXRjaEZvckNoYW5nZXMpKTtcbiAgICAgICAgd2F0Y2hGb3JDaGFuZ2VzKCk7XG4gICAgfVxuXG4gICAgdXBkYXRlU2VsZWN0aW9uKGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIGNvbnN0IGFuY2hvciA9IGVkaXRvci5saXN0U2VsZWN0aW9ucygpWzBdPy5hbmNob3JcbiAgICAgICAgdGhpcy5jdXJyZW50Q3Vyc29yID0ge1xuICAgICAgICAgICAgYW5jaG9yOiBhbmNob3IgPyBlZGl0b3IuaW5kZXhGcm9tUG9zKGFuY2hvcikgOiB1bmRlZmluZWQsXG4gICAgICAgICAgICB2aW1Nb2RlOiBlZGl0b3Iuc3RhdGUudmltPy5tb2RlXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmNsYXNzIFNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgICBwbHVnaW46IEp1bXBUb0xpbmtcblxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IEp1bXBUb0xpbmspIHtcbiAgICAgICAgc3VwZXIoYXBwLCBwbHVnaW4pXG5cbiAgICAgICAgdGhpcy5wbHVnaW4gPSBwbHVnaW5cbiAgICB9XG5cbiAgICBkaXNwbGF5KCk6IHZvaWQge1xuICAgICAgICBsZXQge2NvbnRhaW5lckVsfSA9IHRoaXM7XG5cbiAgICAgICAgY29udGFpbmVyRWwuZW1wdHkoKTtcblxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDInLCB7dGV4dDogJ1NldHRpbmdzIGZvciBKdW1wIFRvIExpbmsuJ30pO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0NoYXJhY3RlcnMgdXNlZCBmb3IgbGluayBoaW50cycpXG4gICAgICAgICAgICAuc2V0RGVzYygnVGhlIGNoYXJhY3RlcnMgcGxhY2VkIG5leHQgdG8gZWFjaCBsaW5rIGFmdGVyIGVudGVyIGxpbmstaGludCBtb2RlLicpXG4gICAgICAgICAgICAuYWRkVGV4dChjYiA9PiB7XG4gICAgICAgICAgICAgICAgY2Iuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubGV0dGVycylcbiAgICAgICAgICAgICAgICAgICAgLm9uQ2hhbmdlKCh2YWx1ZTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5sZXR0ZXJzID0gdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNhdmVEYXRhKHRoaXMucGx1Z2luLnNldHRpbmdzKVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnSnVtcCBUbyBBbnl3aGVyZScpXG4gICAgICAgICAgICAuc2V0RGVzYyhcIlJlZ2V4IGJhc2VkIG5hdmlnYXRpbmcgaW4gZWRpdG9yIG1vZGVcIilcbiAgICAgICAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICAgICAgICAgIHRleHRcbiAgICAgICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCdDdXN0b20gUmVnZXgnKVxuICAgICAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuanVtcFRvQW55d2hlcmVSZWdleClcbiAgICAgICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuanVtcFRvQW55d2hlcmVSZWdleCA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGEodGhpcy5wbHVnaW4uc2V0dGluZ3MpO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdMaWdodHNwZWVkIHJlZ2V4IGNhc2Ugc2Vuc2l0aXZpdHknKVxuICAgICAgICAgICAgLnNldERlc2MoXG4gICAgICAgICAgICAgICAgJ0lmIGVuYWJsZWQsIHRoZSByZWdleCBmb3IgbWF0Y2hpbmcgd2lsbCBiZSBjYXNlIHNlbnNpdGl2ZS4nXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+IHtcbiAgICAgICAgICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubGlnaHRzcGVlZENhc2VTZW5zaXRpdmUpXG4gICAgICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAoc3RhdGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubGlnaHRzcGVlZENhc2VTZW5zaXRpdmUgPSBzdGF0ZTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGEodGhpcy5wbHVnaW4uc2V0dGluZ3MpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnSnVtcCB0byBMaW5rIElmIE9ubHkgT25lIExpbmsgSW4gUGFnZScpXG4gICAgICAgICAgICAuc2V0RGVzYyhcbiAgICAgICAgICAgICAgICAnSWYgZW5hYmxlZCwgYXV0byBqdW1wIHRvIGxpbmsgaWYgdGhlcmUgaXMgb25seSBvbmUgbGluayBpbiBwYWdlJ1xuICAgICAgICAgICAgKVxuICAgICAgICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PiB7XG4gICAgICAgICAgICAgICAgdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmp1bXBUb0xpbmtJZk9uZUxpbmtPbmx5KVxuICAgICAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHN0YXRlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmp1bXBUb0xpbmtJZk9uZUxpbmtPbmx5ID0gc3RhdGU7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVEYXRhKHRoaXMucGx1Z2luLnNldHRpbmdzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0xpZ2h0c3BlZWQgb25seSBqdW1wcyB0byBzdGFydCBvZiB3b3JkcycpXG4gICAgICAgICAgICAuc2V0RGVzYyhcbiAgICAgICAgICAgICAgICAnSWYgZW5hYmxlZCwgbGlnaHRzcGVlZCBqdW1wcyB3aWxsIG9ubHkgdGFyZ2V0IGNoYXJhY3RlcnMgb2NjdXJpbmcgYXQgdGhlIHN0YXJ0IG9mIHdvcmRzLidcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT4ge1xuICAgICAgICAgICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5saWdodHNwZWVkSnVtcFRvU3RhcnRPZldvcmQpXG4gICAgICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAoc3RhdGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubGlnaHRzcGVlZEp1bXBUb1N0YXJ0T2ZXb3JkID0gc3RhdGU7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVEYXRhKHRoaXMucGx1Z2luLnNldHRpbmdzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ051bWJlciBvZiBjaGFyYWN0ZXJzIGZvciBMaWdodHNwZWVkIGp1bXAnKVxuICAgICAgICAgICAgLnNldERlc2MoXG4gICAgICAgICAgICAgICAgJ0RldGVybWluZXMgaG93IG1hbnkgY2hhcmFjdGVycyB5b3UgbmVlZCB0byB0eXBlIHRvIHBlcmZvcm0gYSBMaWdodHNwZWVkIGp1bXAuJ1xuICAgICAgICAgICAgKVxuICAgICAgICAgICAgLmFkZFRleHQoXG4gICAgICAgICAgICAgICAgKHRleHQpID0+XG4gICAgICAgICAgICAgICAgICAgICh0ZXh0XG4gICAgICAgICAgICAgICAgICAgICAgICAuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLmxpZ2h0c3BlZWRDaGFyYWN0ZXJDb3VudCkpXG4gICAgICAgICAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbnVtID0gTnVtYmVyKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWlzTmFOKG51bSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubGlnaHRzcGVlZENoYXJhY3RlckNvdW50ID0gbnVtO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YSh0aGlzLnBsdWdpbi5zZXR0aW5ncyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSkuaW5wdXRFbC50eXBlID0gXCJudW1iZXJcIilcbiAgICAgICAgICAgICk7XG4gICAgfVxufVxuIl0sIm5hbWVzIjpbIldpZGdldFR5cGUiLCJEZWNvcmF0aW9uIiwiUGx1Z2luIiwiVmlld1BsdWdpbiIsIk1hcmtkb3duVmlldyIsImVkaXRvckxpdmVQcmV2aWV3RmllbGQiLCJFZGl0b3JWaWV3IiwiRWRpdG9yU2VsZWN0aW9uIiwiUGx1Z2luU2V0dGluZ1RhYiIsIlNldHRpbmciXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFvR0E7QUFDTyxTQUFTLFNBQVMsQ0FBQyxPQUFPLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUU7QUFDN0QsSUFBSSxTQUFTLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxPQUFPLEtBQUssWUFBWSxDQUFDLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLFVBQVUsT0FBTyxFQUFFLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUU7QUFDaEgsSUFBSSxPQUFPLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxPQUFPLENBQUMsRUFBRSxVQUFVLE9BQU8sRUFBRSxNQUFNLEVBQUU7QUFDL0QsUUFBUSxTQUFTLFNBQVMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO0FBQ25HLFFBQVEsU0FBUyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FB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
