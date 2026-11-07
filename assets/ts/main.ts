/*!
*   Hugo Theme Stack
*
*   @author: Jimmy Cai
*   @website: https://jimmycai.com
*   @link: https://github.com/CaiJimmy/hugo-theme-stack
*/
import menu from './menu';
import createElement from './createElement';
import StackColorScheme from './colorScheme';
import { setupScrollspy } from './scrollspy';
import { setupSmoothAnchors } from './smoothAnchors';
import { setupPaginationJump } from './pagination';
import { setupCodeCopy } from './code-copy';

let Stack = {
    init: () => {
        /**
         * Bind menu event
         */
        menu();

        const articleContent = document.querySelector('.article-content') as HTMLElement;
        if (articleContent) {
            setupSmoothAnchors();
            setupScrollspy();
            setupCodeCopy();
        }

        setupPaginationJump();

        new StackColorScheme(document.getElementById('dark-mode-toggle')!);
    }
}

// This entry is deferred: wait for all deferred interaction scripts, not image loads.
if (document.readyState === 'complete') {
    Stack.init();
} else {
    document.addEventListener('DOMContentLoaded', () => Stack.init(), { once: true });
}

declare global {
    interface Window {
        createElement: any;
        Stack: any
    }
}

window.Stack = Stack;
window.createElement = createElement;
