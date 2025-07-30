// UI Manager - Handles UI interactions and notifications
export class UIManager {
    constructor() {
        this.toasts = new Map();
        this.modals = new Map();
        this.toastContainer = null;
        this.modalOverlay = null;
        this.loadingIndicator = null;
        this.toastIdCounter = 0;
    }

    init() {
        this.setupContainers();
        this.setupEventListeners();
    }

    setupContainers() {
        // Toast container
        this.toastContainer = document.getElementById('toast-container');
        if (!this.toastContainer) {
            this.toastContainer = document.createElement('div');
            this.toastContainer.id = 'toast-container';
            this.toastContainer.className = 'toast-container';
            document.body.appendChild(this.toastContainer);
        }

        // Modal overlay
        this.modalOverlay = document.getElementById('modal-overlay');
        if (!this.modalOverlay) {
            this.modalOverlay = document.createElement('div');
            this.modalOverlay.id = 'modal-overlay';
            this.modalOverlay.className = 'modal-overlay';
            document.body.appendChild(this.modalOverlay);
        }

        // Loading indicator
        this.loadingIndicator = document.getElementById('loading-indicator');
    }

    setupEventListeners() {
        // Close modals when clicking overlay
        if (this.modalOverlay) {
            this.modalOverlay.addEventListener('click', (e) => {
                if (e.target === this.modalOverlay) {
                    this.closeAllModals();
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    // Toast notifications
    showToast(message, type = 'info', options = {}) {
        const toastId = ++this.toastIdCounter;
        const toast = this.createToast(toastId, message, type, options);
        
        this.toasts.set(toastId, toast);
        this.toastContainer.appendChild(toast.element);
        
        // Trigger animation
        requestAnimationFrame(() => {
            toast.element.classList.add('show');
        });

        // Auto-remove after duration
        if (toast.duration > 0) {
            setTimeout(() => {
                this.removeToast(toastId);
            }, toast.duration);
        }

        return toastId;
    }

    createToast(id, message, type, options) {
        const toast = {
            id,
            type,
            message,
            duration: options.duration || this.getDefaultDuration(type),
            actions: options.actions || [],
            element: null
        };

        const element = document.createElement('div');
        element.className = `toast ${type}`;
        element.setAttribute('data-toast-id', id);
        
        element.innerHTML = `
            <div class="toast-icon">${this.getToastIcon(type)}</div>
            <div class="toast-content">
                ${options.title ? `<div class="toast-title">${this.escapeHTML(options.title)}</div>` : ''}
                <div class="toast-message">${this.escapeHTML(message)}</div>
                ${toast.actions.length > 0 ? this.createToastActions(toast.actions) : ''}
            </div>
            <button class="toast-close" aria-label="Close notification">✕</button>
        `;

        // Add event listeners
        const closeBtn = element.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            this.removeToast(id);
        });

        // Add action listeners
        toast.actions.forEach((action, index) => {
            const actionBtn = element.querySelector(`[data-action-index="${index}"]`);
            if (actionBtn) {
                actionBtn.addEventListener('click', () => {
                    if (action.callback) {
                        action.callback();
                    }
                    if (action.closeOnClick !== false) {
                        this.removeToast(id);
                    }
                });
            }
        });

        toast.element = element;
        return toast;
    }

    createToastActions(actions) {
        const actionsHtml = actions.map((action, index) => 
            `<button class="toast-action" data-action-index="${index}">${this.escapeHTML(action.label)}</button>`
        ).join('');
        
        return `<div class="toast-actions">${actionsHtml}</div>`;
    }

    removeToast(toastId) {
        const toast = this.toasts.get(toastId);
        if (!toast) return;

        toast.element.classList.remove('show');
        
        setTimeout(() => {
            if (toast.element.parentNode) {
                toast.element.parentNode.removeChild(toast.element);
            }
            this.toasts.delete(toastId);
        }, 300);
    }

    removeAllToasts() {
        this.toasts.forEach((toast, id) => {
            this.removeToast(id);
        });
    }

    getToastIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️',
            live: '🔴',
            offline: '⚫'
        };
        return icons[type] || 'ℹ️';
    }

    getDefaultDuration(type) {
        const durations = {
            success: 3000,
            error: 5000,
            warning: 4000,
            info: 3000,
            live: 0, // Persistent
            offline: 3000
        };
        return durations[type] || 3000;
    }

    // Modal management
    showModal(modalId, content, options = {}) {
        const modal = this.createModal(modalId, content, options);
        this.modals.set(modalId, modal);
        
        this.modalOverlay.appendChild(modal.element);
        this.modalOverlay.classList.add('active');
        
        // Focus management
        if (options.focusElement) {
            setTimeout(() => {
                const focusEl = modal.element.querySelector(options.focusElement);
                if (focusEl) focusEl.focus();
            }, 100);
        }

        return modal;
    }

    createModal(id, content, options) {
        const modal = {
            id,
            title: options.title || '',
            content,
            size: options.size || 'medium',
            closable: options.closable !== false,
            element: null
        };

        const element = document.createElement('div');
        element.className = `modal modal-${modal.size}`;
        element.setAttribute('data-modal-id', id);
        element.setAttribute('role', 'dialog');
        element.setAttribute('aria-labelledby', `modal-title-${id}`);
        
        element.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="modal-title-${id}" class="modal-title">${this.escapeHTML(modal.title)}</h2>
                    ${modal.closable ? '<button class="modal-close" aria-label="Close modal">✕</button>' : ''}
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;

        // Add close event listener
        if (modal.closable) {
            const closeBtn = element.querySelector('.modal-close');
            closeBtn.addEventListener('click', () => {
                this.closeModal(id);
            });
        }

        modal.element = element;
        return modal;
    }

    closeModal(modalId) {
        const modal = this.modals.get(modalId);
        if (!modal) return;

        modal.element.remove();
        this.modals.delete(modalId);

        // Hide overlay if no modals are open
        if (this.modals.size === 0) {
            this.modalOverlay.classList.remove('active');
        }
    }

    closeAllModals() {
        this.modals.forEach((modal, id) => {
            this.closeModal(id);
        });
    }

    updateModalContent(modalId, content) {
        const modal = this.modals.get(modalId);
        if (!modal) return;

        const bodyElement = modal.element.querySelector('.modal-body');
        if (bodyElement) {
            bodyElement.innerHTML = content;
        }
    }

    // Loading states
    showLoading(show = true, message = 'Loading...') {
        if (!this.loadingIndicator) return;

        if (show) {
            this.loadingIndicator.style.display = 'flex';
            const messageElement = this.loadingIndicator.querySelector('.loading-message');
            if (messageElement) {
                messageElement.textContent = message;
            }
        } else {
            this.loadingIndicator.style.display = 'none';
        }
    }

    // Confirmation dialogs
    showConfirmDialog(message, options = {}) {
        return new Promise((resolve) => {
            const modalId = 'confirm-dialog';
            const content = `
                <div class="confirm-dialog">
                    <p class="confirm-message">${this.escapeHTML(message)}</p>
                    <div class="confirm-actions">
                        <button class="btn btn-secondary" data-action="cancel">
                            ${options.cancelText || 'Cancel'}
                        </button>
                        <button class="btn btn-primary" data-action="confirm">
                            ${options.confirmText || 'Confirm'}
                        </button>
                    </div>
                </div>
            `;

            const modal = this.showModal(modalId, content, {
                title: options.title || 'Confirm',
                size: 'small',
                focusElement: '[data-action="confirm"]'
            });

            // Add action listeners
            modal.element.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (action === 'confirm') {
                    resolve(true);
                    this.closeModal(modalId);
                } else if (action === 'cancel') {
                    resolve(false);
                    this.closeModal(modalId);
                }
            });
        });
    }

    // Input dialogs
    showInputDialog(message, options = {}) {
        return new Promise((resolve) => {
            const modalId = 'input-dialog';
            const content = `
                <div class="input-dialog">
                    <p class="input-message">${this.escapeHTML(message)}</p>
                    <input 
                        type="${options.type || 'text'}" 
                        class="input-field" 
                        placeholder="${options.placeholder || ''}"
                        value="${options.defaultValue || ''}"
                    >
                    <div class="input-actions">
                        <button class="btn btn-secondary" data-action="cancel">
                            ${options.cancelText || 'Cancel'}
                        </button>
                        <button class="btn btn-primary" data-action="submit">
                            ${options.submitText || 'Submit'}
                        </button>
                    </div>
                </div>
            `;

            const modal = this.showModal(modalId, content, {
                title: options.title || 'Input',
                size: 'small',
                focusElement: '.input-field'
            });

            const inputField = modal.element.querySelector('.input-field');

            // Handle form submission
            const handleSubmit = () => {
                const value = inputField.value.trim();
                if (options.required && !value) {
                    this.showToast('This field is required', 'warning');
                    return;
                }
                resolve(value);
                this.closeModal(modalId);
            };

            // Add event listeners
            modal.element.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (action === 'submit') {
                    handleSubmit();
                } else if (action === 'cancel') {
                    resolve(null);
                    this.closeModal(modalId);
                }
            });

            inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                }
            });
        });
    }

    // Context menu
    showContextMenu(x, y, items) {
        this.hideContextMenu(); // Hide any existing context menu

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.zIndex = '10000';

        const menuItems = items.map(item => {
            if (item.separator) {
                return '<div class="context-menu-separator"></div>';
            }
            
            return `
                <div class="context-menu-item ${item.disabled ? 'disabled' : ''} ${item.danger ? 'danger' : ''}" 
                     data-action="${item.action}">
                    ${item.icon ? `<span class="context-menu-icon">${item.icon}</span>` : ''}
                    <span class="context-menu-label">${this.escapeHTML(item.label)}</span>
                </div>
            `;
        }).join('');

        menu.innerHTML = menuItems;

        // Add click listener
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.context-menu-item');
            if (item && !item.classList.contains('disabled')) {
                const action = item.dataset.action;
                const menuItem = items.find(i => i.action === action);
                if (menuItem && menuItem.callback) {
                    menuItem.callback();
                }
                this.hideContextMenu();
            }
        });

        // Position adjustment to keep menu in viewport
        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        
        if (rect.right > window.innerWidth) {
            menu.style.left = `${x - rect.width}px`;
        }
        
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${y - rect.height}px`;
        }

        // Hide on outside click
        setTimeout(() => {
            document.addEventListener('click', this.hideContextMenu.bind(this), { once: true });
        }, 0);

        this.currentContextMenu = menu;
    }

    hideContextMenu() {
        if (this.currentContextMenu) {
            this.currentContextMenu.remove();
            this.currentContextMenu = null;
        }
    }

    // Progress indicators
    showProgress(message, progress = 0) {
        const progressId = 'progress-indicator';
        let modal = this.modals.get(progressId);

        if (!modal) {
            const content = `
                <div class="progress-dialog">
                    <div class="progress-message">${this.escapeHTML(message)}</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="progress-text">${Math.round(progress)}%</div>
                </div>
            `;

            modal = this.showModal(progressId, content, {
                title: 'Progress',
                closable: false,
                size: 'small'
            });
        } else {
            this.updateProgress(message, progress);
        }

        return progressId;
    }

    updateProgress(message, progress) {
        const modal = this.modals.get('progress-indicator');
        if (!modal) return;

        const messageEl = modal.element.querySelector('.progress-message');
        const fillEl = modal.element.querySelector('.progress-fill');
        const textEl = modal.element.querySelector('.progress-text');

        if (messageEl) messageEl.textContent = message;
        if (fillEl) fillEl.style.width = `${progress}%`;
        if (textEl) textEl.textContent = `${Math.round(progress)}%`;
    }

    hideProgress() {
        this.closeModal('progress-indicator');
    }

    // Utility methods
    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Animation helpers
    fadeIn(element, duration = 300) {
        element.style.opacity = '0';
        element.style.display = 'block';
        
        const start = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);
            
            element.style.opacity = progress;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    fadeOut(element, duration = 300) {
        const start = performance.now();
        const startOpacity = parseFloat(getComputedStyle(element).opacity);
        
        const animate = (currentTime) => {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);
            
            element.style.opacity = startOpacity * (1 - progress);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                element.style.display = 'none';
            }
        };
        
        requestAnimationFrame(animate);
    }

    slideDown(element, duration = 300) {
        element.style.height = '0';
        element.style.overflow = 'hidden';
        element.style.display = 'block';
        
        const targetHeight = element.scrollHeight;
        const start = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);
            
            element.style.height = `${targetHeight * progress}px`;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                element.style.height = '';
                element.style.overflow = '';
            }
        };
        
        requestAnimationFrame(animate);
    }

    slideUp(element, duration = 300) {
        const startHeight = element.offsetHeight;
        const start = performance.now();
        
        element.style.overflow = 'hidden';
        
        const animate = (currentTime) => {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);
            
            element.style.height = `${startHeight * (1 - progress)}px`;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                element.style.display = 'none';
                element.style.height = '';
                element.style.overflow = '';
            }
        };
        
        requestAnimationFrame(animate);
    }

    // Cleanup
    destroy() {
        this.removeAllToasts();
        this.closeAllModals();
        this.hideContextMenu();
        
        if (this.toastContainer && this.toastContainer.parentNode) {
            this.toastContainer.parentNode.removeChild(this.toastContainer);
        }
        
        if (this.modalOverlay && this.modalOverlay.parentNode) {
            this.modalOverlay.parentNode.removeChild(this.modalOverlay);
        }
    }
}

