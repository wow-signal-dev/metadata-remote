/*
 * Metadata Remote - Intelligent audio metadata editor
 * Copyright (C) 2025 Dr. William Nelson Leonard
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * App Dialog Module
 * Provides in-app confirm and list dialogs.
 */

(function() {
    window.MetadataRemote = window.MetadataRemote || {};
    window.MetadataRemote.UI = window.MetadataRemote.UI || {};

    const getEl = (id) => document.getElementById(id);

    const copyTextToClipboard = async (text) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
    };

    const Dialog = {
        overlay: null,
        box: null,
        titleEl: null,
        bodyEl: null,
        copyBtn: null,
        cancelBtn: null,
        confirmBtn: null,
        isOpenFlag: false,
        resolve: null,
        keyHandler: null,

        init() {
            this.overlay = getEl('app-dialog-overlay');
            this.box = getEl('app-dialog-box');
            this.titleEl = getEl('app-dialog-title');
            this.bodyEl = getEl('app-dialog-body');
            this.copyBtn = getEl('app-dialog-copy');
            this.cancelBtn = getEl('app-dialog-cancel');
            this.confirmBtn = getEl('app-dialog-confirm');

            if (!this.overlay || !this.box) {
                return;
            }

            this.overlay.addEventListener('click', () => {
                this.close(false);
            });

            this.cancelBtn.addEventListener('click', () => {
                this.close(false);
            });

            this.confirmBtn.addEventListener('click', () => {
                this.close(true);
            });
        },

        isOpen() {
            return this.isOpenFlag;
        },

        openBase({ title, bodyText, confirmText, cancelText, danger = false, showCopy = false, copyText = '', showCancel = true, monospace = false, disableConfirm = false }) {
            if (!this.overlay || !this.box || this.isOpen()) {
                return Promise.resolve(false);
            }

            this.isOpenFlag = true;

            this.titleEl.textContent = title || '';
            this.bodyEl.textContent = bodyText || '';
            this.bodyEl.classList.toggle('monospace', Boolean(monospace));

            this.confirmBtn.textContent = confirmText || 'OK';
            this.cancelBtn.textContent = cancelText || 'Cancel';

            this.cancelBtn.style.display = showCancel ? 'inline-flex' : 'none';

            this.confirmBtn.classList.toggle('danger', Boolean(danger));
            this.confirmBtn.disabled = Boolean(disableConfirm);

            this.copyBtn.style.display = showCopy ? 'inline-flex' : 'none';
            this.copyBtn.onclick = null;

            if (showCopy) {
                const ButtonStatus = window.MetadataRemote.UI.ButtonStatus;

                this.copyBtn.onclick = async () => {
                    try {
                        await copyTextToClipboard(copyText);
                        if (ButtonStatus) {
                            ButtonStatus.showButtonStatus(this.copyBtn, 'Copied', 'success', 1200);
                        }
                    } catch (err) {
                        if (ButtonStatus) {
                            ButtonStatus.showButtonStatus(this.copyBtn, 'Copy failed', 'error', 2000);
                        }
                    }
                };
            }

            this.overlay.classList.add('active');
            this.box.classList.add('active');

            this.keyHandler = (e) => {
                if (!this.isOpen()) return;

                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.close(false);
                    return;
                }

                if (e.key === 'Enter') {
                    const active = document.activeElement;
                    if (active === this.cancelBtn) {
                        return;
                    }

                    if (this.confirmBtn.disabled) {
                        return;
                    }

                    e.preventDefault();
                    this.close(true);
                    return;
                }

                 if (e.key === 'Tab') {
                     const focusable = [this.copyBtn, this.cancelBtn, this.confirmBtn].filter(btn => btn && btn.offsetParent !== null && btn.style.display !== 'none');
                     if (focusable.length === 0) return;


                    const currentIndex = focusable.indexOf(document.activeElement);
                    let nextIndex = currentIndex;

                    if (e.shiftKey) {
                        nextIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
                    } else {
                        nextIndex = currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
                    }

                    if (nextIndex !== -1) {
                        e.preventDefault();
                        focusable[nextIndex].focus();
                    }
                }
            };

            document.addEventListener('keydown', this.keyHandler, true);

            return new Promise((resolve) => {
                this.resolve = resolve;

                setTimeout(() => {
                    this.confirmBtn.focus();
                }, 0);
            });
        },

        close(result) {
            if (!this.isOpen()) {
                return;
            }

            this.overlay.classList.remove('active');
            this.box.classList.remove('active');


            if (this.keyHandler) {
                document.removeEventListener('keydown', this.keyHandler, true);
                this.keyHandler = null;
            }

            this.isOpenFlag = false;

            if (this.resolve) {
                const resolve = this.resolve;
                this.resolve = null;
                resolve(Boolean(result));
            }
        },

        confirm({ title = 'Confirm', message = '', confirmText = 'OK', cancelText = 'Cancel', danger = false }) {
            return this.openBase({
                title,
                bodyText: message,
                confirmText,
                cancelText,
                danger,
                showCopy: false,
                copyText: '',
                showCancel: true
            });
        },

        update({ title = null, bodyText = null, monospace = null } = {}) {
            if (!this.isOpen()) {
                return;
            }

            if (title !== null && this.titleEl) {
                this.titleEl.textContent = title;
            }

            if (bodyText !== null && this.bodyEl) {
                this.bodyEl.textContent = bodyText;
            }

            if (monospace !== null && this.bodyEl) {
                this.bodyEl.classList.toggle('monospace', Boolean(monospace));
            }
        },

        showLoading({ title = 'Please wait', message = 'Working...', cancelText = 'Cancel', monospace = false } = {}) {
            return this.openBase({
                title,
                bodyText: message,
                confirmText: 'Loading…',
                cancelText,
                danger: false,
                showCopy: false,
                copyText: '',
                showCancel: true,
                monospace,
                disableConfirm: true
            });
        },

        alert({ title = 'Message', message = '', confirmText = 'OK' }) {
            return this.openBase({
                title,
                bodyText: message,
                confirmText,
                cancelText: '',
                danger: false,
                showCopy: false,
                copyText: '',
                showCancel: false
            });
        },

        showConflicts({ title = 'Conflicts', intro = '', items = [] }) {
            const body = intro + (intro ? '\n\n' : '') + items.join('\n');
            const copyText = body;

            return this.openBase({
                title,
                bodyText: body,
                confirmText: 'OK',
                cancelText: 'Close',
                danger: false,
                showCopy: true,
                copyText,
                showCancel: true
            }).then(() => {});
        },

        confirmList({ title = 'Confirm', intro = '', items = [], confirmText = 'OK', cancelText = 'Cancel', danger = false, icon = '', showCopy = false, monospace = false }) {
            const body = intro + (intro ? '\n\n' : '') + items.join('\n');
            const finalTitle = icon ? `${icon} ${title}` : title;

            return this.openBase({
                title: finalTitle,
                bodyText: body,
                confirmText,
                cancelText,
                danger,
                showCopy,
                copyText: body,
                showCancel: true,
                monospace
            });
        }
    };

    window.MetadataRemote.UI.Dialog = Dialog;

    document.addEventListener('DOMContentLoaded', () => {
        Dialog.init();
    });
})();
