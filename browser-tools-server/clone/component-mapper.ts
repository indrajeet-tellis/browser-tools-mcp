export interface ComponentMatch {
  nodeId: string;
  tagName: string;
  className: string;
  shadcnComponent: string;
  confidence: number;
  attributes: Record<string, string>;
  children?: ComponentMatch[];
  reasoning: string[];
}

export interface ComponentMapping {
  components: ComponentMatch[];
  summary: {
    totalComponents: number;
    componentTypes: Record<string, number>;
    highConfidence: ComponentMatch[];
    capturedAt: string;
  };
}

/**
 * Maps DOM elements to shadcn/ui component equivalents using heuristics
 */
export class ComponentMapper {
  private readonly CONFIDENCE_THRESHOLD = 0.6;

  /**
   * Analyzes DOM snapshot and maps elements to shadcn components
   */
  public mapComponents(domSnapshot: any): ComponentMapping {
    const components: ComponentMatch[] = [];
    
    if (domSnapshot && domSnapshot.root) {
      this.analyzeNode(domSnapshot.root, components, '');
    }

    // Sort by confidence and filter low-confidence matches
    const filteredComponents = components
      .filter(c => c.confidence >= 0.3)
      .sort((a, b) => b.confidence - a.confidence);

    const componentTypes: Record<string, number> = {};
    filteredComponents.forEach(comp => {
      componentTypes[comp.shadcnComponent] = (componentTypes[comp.shadcnComponent] || 0) + 1;
    });

    return {
      components: filteredComponents,
      summary: {
        totalComponents: filteredComponents.length,
        componentTypes,
        highConfidence: filteredComponents.filter(c => c.confidence >= this.CONFIDENCE_THRESHOLD),
        capturedAt: new Date().toISOString()
      }
    };
  }

  private analyzeNode(node: any, components: ComponentMatch[], parentPath: string): void {
    if (!node || node.nodeType !== 1) { // Only process element nodes
      return;
    }

    const match = this.detectComponent(node);
    if (match) {
      components.push(match);
    }

    // Recursively analyze child nodes
    if (node.childNodes && Array.isArray(node.childNodes)) {
      node.childNodes.forEach((child: any, index: number) => {
        this.analyzeNode(child, components, `${parentPath}.${index}`);
      });
    }
  }

  private detectComponent(node: any): ComponentMatch | null {
    const tagName = node.tagName?.toLowerCase() || '';
    const className = this.getClassString(node);
    const attributes = this.getAttributesMap(node);
    const text = this.getTextContent(node);

    // Try different component detection strategies
    const detectors = [
      () => this.detectButton(node, tagName, className, attributes, text),
      () => this.detectCard(node, tagName, className, attributes),
      () => this.detectNavigation(node, tagName, className, attributes),
      () => this.detectForm(node, tagName, className, attributes),
      () => this.detectInput(node, tagName, className, attributes),
      () => this.detectBadge(node, tagName, className, attributes, text),
      () => this.detectAvatar(node, tagName, className, attributes),
      () => this.detectDialog(node, tagName, className, attributes),
      () => this.detectTable(node, tagName, className, attributes),
      () => this.detectLayout(node, tagName, className, attributes),
    ];

    for (const detector of detectors) {
      const result = detector();
      if (result) {
        return {
          nodeId: node.nodeId || 'unknown',
          tagName,
          className,
          ...result,
          attributes
        };
      }
    }

    return null;
  }

  private detectButton(node: any, tagName: string, className: string, attributes: Record<string, string>, text: string): Partial<ComponentMatch> | null {
    const reasoning: string[] = [];
    let confidence = 0;

    // Primary button indicators
    if (tagName === 'button') {
      confidence += 0.8;
      reasoning.push('HTML button element');
    }

    if (attributes.type === 'submit') {
      confidence += 0.3;
      reasoning.push('Submit type button');
    }

    // Class-based detection
    const buttonClasses = ['btn', 'button', 'cta', 'action', 'primary', 'secondary'];
    const matchedClasses = buttonClasses.filter(cls => className.toLowerCase().includes(cls));
    if (matchedClasses.length > 0) {
      confidence += 0.4 * matchedClasses.length;
      reasoning.push(`Button-related classes: ${matchedClasses.join(', ')}`);
    }

    // Role-based detection
    if (attributes.role === 'button') {
      confidence += 0.6;
      reasoning.push('Button role attribute');
    }

    // Clickable elements that look like buttons
    if (['div', 'span', 'a'].includes(tagName) && (attributes.onclick || className.includes('click'))) {
      confidence += 0.3;
      reasoning.push('Clickable element with button-like behavior');
    }

    // Text content analysis
    const buttonKeywords = ['submit', 'save', 'cancel', 'delete', 'edit', 'download', 'upload', 'sign', 'log'];
    const hasButtonKeyword = buttonKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );
    if (hasButtonKeyword) {
      confidence += 0.2;
      reasoning.push('Contains button-like text');
    }

    if (confidence >= 0.3) {
      // Determine button variant
      let variant = 'default';
      if (className.includes('primary') || className.includes('main')) {
        variant = 'primary';
      } else if (className.includes('secondary') || className.includes('outline')) {
        variant = 'secondary';
      } else if (className.includes('destructive') || className.includes('danger')) {
        variant = 'destructive';
      } else if (className.includes('ghost')) {
        variant = 'ghost';
      }

      return {
        shadcnComponent: `Button (${variant})`,
        confidence: Math.min(confidence, 1),
        reasoning
      };
    }

    return null;
  }

  private detectCard(node: any, tagName: string, className: string, attributes: Record<string, string>): Partial<ComponentMatch> | null {
    const reasoning: string[] = [];
    let confidence = 0;

    // Class-based detection
    const cardClasses = ['card', 'panel', 'widget', 'tile', 'box'];
    const matchedClasses = cardClasses.filter(cls => className.toLowerCase().includes(cls));
    if (matchedClasses.length > 0) {
      confidence += 0.6;
      reasoning.push(`Card-related classes: ${matchedClasses.join(', ')}`);
    }

    // Structural patterns
    if (['div', 'section', 'article'].includes(tagName)) {
      confidence += 0.2;
      reasoning.push('Container element suitable for card');
    }

    // Look for common card children (header, body, footer)
    const hasHeader = this.hasChildWithClass(node, ['header', 'title', 'head']);
    const hasBody = this.hasChildWithClass(node, ['body', 'content', 'main']);
    const hasFooter = this.hasChildWithClass(node, ['footer', 'actions', 'buttons']);

    if (hasHeader || hasBody || hasFooter) {
      confidence += 0.3;
      reasoning.push('Contains card-like structure (header/body/footer)');
    }

    if (confidence >= 0.3) {
      return {
        shadcnComponent: 'Card',
        confidence: Math.min(confidence, 1),
        reasoning
      };
    }

    return null;
  }

  private detectNavigation(node: any, tagName: string, className: string, attributes: Record<string, string>): Partial<ComponentMatch> | null {
    const reasoning: string[] = [];
    let confidence = 0;

    // Semantic navigation
    if (tagName === 'nav') {
      confidence += 0.8;
      reasoning.push('HTML nav element');
    }

    // Role-based detection
    if (attributes.role === 'navigation') {
      confidence += 0.7;
      reasoning.push('Navigation role attribute');
    }

    // Class-based detection
    const navClasses = ['nav', 'navbar', 'menu', 'breadcrumb', 'sidebar', 'header'];
    const matchedClasses = navClasses.filter(cls => className.toLowerCase().includes(cls));
    if (matchedClasses.length > 0) {
      confidence += 0.5;
      reasoning.push(`Navigation classes: ${matchedClasses.join(', ')}`);
    }

    // List-based navigation
    if (tagName === 'ul' || tagName === 'ol') {
      const hasNavLinks = this.hasChildWithTag(node, 'a') || this.hasChildWithClass(node, ['link', 'nav-item']);
      if (hasNavLinks) {
        confidence += 0.4;
        reasoning.push('List with navigation links');
      }
    }

    if (confidence >= 0.3) {
      // Determine navigation type
      let navType = 'Navigation';
      if (className.includes('breadcrumb')) {
        navType = 'Breadcrumb';
      } else if (className.includes('sidebar')) {
        navType = 'NavigationMenu (sidebar)';
      } else if (className.includes('navbar') || className.includes('header')) {
        navType = 'NavigationMenu (main)';
      }

      return {
        shadcnComponent: navType,
        confidence: Math.min(confidence, 1),
        reasoning
      };
    }

    return null;
  }

  private detectForm(node: any, tagName: string, className: string, attributes: Record<string, string>): Partial<ComponentMatch> | null {
    const reasoning: string[] = [];
    let confidence = 0;

    if (tagName === 'form') {
      confidence += 0.9;
      reasoning.push('HTML form element');
    }

    // Look for form elements
    const hasFormElements = this.hasChildWithTag(node, 'input') || 
                           this.hasChildWithTag(node, 'select') || 
                           this.hasChildWithTag(node, 'textarea');
    
    if (hasFormElements) {
      confidence += 0.4;
      reasoning.push('Contains form input elements');
    }

    const formClasses = ['form', 'contact', 'signup', 'login', 'register'];
    const matchedClasses = formClasses.filter(cls => className.toLowerCase().includes(cls));
    if (matchedClasses.length > 0) {
      confidence += 0.3;
      reasoning.push(`Form-related classes: ${matchedClasses.join(', ')}`);
    }

    if (confidence >= 0.3) {
      return {
        shadcnComponent: 'Form',
        confidence: Math.min(confidence, 1),
        reasoning
      };
    }

    return null;
  }

  private detectInput(node: any, tagName: string, className: string, attributes: Record<string, string>): Partial<ComponentMatch> | null {
    const reasoning: string[] = [];
    let confidence = 0;

    if (tagName === 'input') {
      confidence += 0.8;
      reasoning.push('HTML input element');

      const inputType = attributes.type || 'text';
      let component = 'Input';

      switch (inputType) {
        case 'checkbox':
          component = 'Checkbox';
          break;
        case 'radio':
          component = 'RadioGroup';
          break;
        case 'range':
          component = 'Slider';
          break;
        case 'date':
        case 'datetime-local':
          component = 'DatePicker';
          break;
        case 'file':
          component = 'Input (file)';
          break;
      }

      return {
        shadcnComponent: component,
        confidence: Math.min(confidence, 1),
        reasoning
      };
    }

    if (tagName === 'textarea') {
      confidence += 0.8;
      reasoning.push('HTML textarea element');
      return {
        shadcnComponent: 'Textarea',
        confidence: Math.min(confidence, 1),
        reasoning
      };
    }

    if (tagName === 'select') {
      confidence += 0.8;
      reasoning.push('HTML select element');
      return {
        shadcnComponent: 'Select',
        confidence: Math.min(confidence, 1),
        reasoning
      };
    }

    return null;
  }

  private detectBadge(node: any, tagName: string, className: string, attributes: Record<string, string>, text: string): Partial<ComponentMatch> | null {
    const reasoning: string[] = [];
    let confidence = 0;

    const badgeClasses = ['badge', 'tag', 'chip', 'label', 'status'];
    const matchedClasses = badgeClasses.filter(cls => className.toLowerCase().includes(cls));
    if (matchedClasses.length > 0) {
      confidence += 0.7;
      reasoning.push(`Badge-related classes: ${matchedClasses.join(', ')}`);
    }

    // Small inline elements with short text
    if (['span', 'small', 'div'].includes(tagName) && text.length < 20 && text.trim().length > 0) {
      confidence += 0.3;
      reasoning.push('Small element with short text content');
    }

    if (confidence >= 0.4) {
      return {
        shadcnComponent: 'Badge',
        confidence: Math.min(confidence, 1),
        reasoning
      };
    }

    return null;
  }

  private detectAvatar(node: any, tagName: string, className: string, attributes: Record<string, string>): Partial<ComponentMatch> | null {
    const reasoning: string[] = [];
    let confidence = 0;

    if (tagName === 'img') {
      const avatarClasses = ['avatar', 'profile', 'user', 'photo'];
      const matchedClasses = avatarClasses.filter(cls => className.toLowerCase().includes(cls));
      if (matchedClasses.length > 0) {
        confidence += 0.8;
        reasoning.push(`Avatar-related classes: ${matchedClasses.join(', ')}`);
      }

      // Check if image is square-ish (common for avatars)
      if (attributes.width && attributes.height) {
        const width = parseInt(attributes.width);
        const height = parseInt(attributes.height);
        if (width && height && Math.abs(width - height) <= 20) {
          confidence += 0.3;
          reasoning.push('Square-ish image dimensions');
        }
      }
    }

    const avatarClasses = ['avatar', 'profile', 'user-photo'];
    const matchedClasses = avatarClasses.filter(cls => className.toLowerCase().includes(cls));
    if (matchedClasses.length > 0) {
      confidence += 0.6;
      reasoning.push(`Avatar container classes: ${matchedClasses.join(', ')}`);
    }

    if (confidence >= 0.4) {
      return {
        shadcnComponent: 'Avatar',
        confidence: Math.min(confidence, 1),
        reasoning
      };
    }

    return null;
  }

  private detectDialog(node: any, tagName: string, className: string, attributes: Record<string, string>): Partial<ComponentMatch> | null {
    const reasoning: string[] = [];
    let confidence = 0;

    if (tagName === 'dialog') {
      confidence += 0.9;
      reasoning.push('HTML dialog element');
    }

    if (attributes.role === 'dialog' || attributes.role === 'alertdialog') {
      confidence += 0.8;
      reasoning.push('Dialog role attribute');
    }

    const dialogClasses = ['modal', 'dialog', 'popup', 'overlay', 'alert'];
    const matchedClasses = dialogClasses.filter(cls => className.toLowerCase().includes(cls));
    if (matchedClasses.length > 0) {
      confidence += 0.6;
      reasoning.push(`Dialog-related classes: ${matchedClasses.join(', ')}`);
    }

    if (confidence >= 0.4) {
      let dialogType = 'Dialog';
      if (className.includes('alert') || attributes.role === 'alertdialog') {
        dialogType = 'AlertDialog';
      }

      return {
        shadcnComponent: dialogType,
        confidence: Math.min(confidence, 1),
        reasoning
      };
    }

    return null;
  }

  private detectTable(node: any, tagName: string, className: string, attributes: Record<string, string>): Partial<ComponentMatch> | null {
    const reasoning: string[] = [];
    let confidence = 0;

    if (tagName === 'table') {
      confidence += 0.9;
      reasoning.push('HTML table element');
    }

    if (attributes.role === 'table' || attributes.role === 'grid') {
      confidence += 0.8;
      reasoning.push('Table/grid role attribute');
    }

    const tableClasses = ['table', 'grid', 'data-table', 'datatable'];
    const matchedClasses = tableClasses.filter(cls => className.toLowerCase().includes(cls));
    if (matchedClasses.length > 0) {
      confidence += 0.7;
      reasoning.push(`Table-related classes: ${matchedClasses.join(', ')}`);
    }

    if (confidence >= 0.4) {
      return {
        shadcnComponent: 'Table',
        confidence: Math.min(confidence, 1),
        reasoning
      };
    }

    return null;
  }

  private detectLayout(node: any, tagName: string, className: string, attributes: Record<string, string>): Partial<ComponentMatch> | null {
    const reasoning: string[] = [];
    let confidence = 0;

    // Sheet/Drawer detection
    const sheetClasses = ['sheet', 'drawer', 'sidebar', 'offcanvas'];
    const sheetMatches = sheetClasses.filter(cls => className.toLowerCase().includes(cls));
    if (sheetMatches.length > 0) {
      confidence += 0.6;
      reasoning.push(`Sheet/drawer classes: ${sheetMatches.join(', ')}`);

      if (confidence >= 0.4) {
        return {
          shadcnComponent: 'Sheet',
          confidence: Math.min(confidence, 1),
          reasoning
        };
      }
    }

    // Accordion detection
    const accordionClasses = ['accordion', 'collapse', 'expand'];
    const accordionMatches = accordionClasses.filter(cls => className.toLowerCase().includes(cls));
    if (accordionMatches.length > 0) {
      confidence += 0.6;
      reasoning.push(`Accordion classes: ${accordionMatches.join(', ')}`);

      if (confidence >= 0.4) {
        return {
          shadcnComponent: 'Accordion',
          confidence: Math.min(confidence, 1),
          reasoning
        };
      }
    }

    // Tabs detection
    const tabClasses = ['tab', 'tabs'];
    const tabMatches = tabClasses.filter(cls => className.toLowerCase().includes(cls));
    if (tabMatches.length > 0 || attributes.role === 'tablist') {
      confidence += 0.7;
      reasoning.push(`Tab-related elements`);

      if (confidence >= 0.4) {
        return {
          shadcnComponent: 'Tabs',
          confidence: Math.min(confidence, 1),
          reasoning
        };
      }
    }

    return null;
  }

  // Helper methods
  private getClassString(node: any): string {
    if (node.attributes && Array.isArray(node.attributes)) {
      const classAttr = node.attributes.find((attr: any) => attr.name === 'class');
      return classAttr?.value || '';
    }
    return '';
  }

  private getAttributesMap(node: any): Record<string, string> {
    const attributes: Record<string, string> = {};
    if (node.attributes && Array.isArray(node.attributes)) {
      node.attributes.forEach((attr: any) => {
        attributes[attr.name] = attr.value;
      });
    }
    return attributes;
  }

  private getTextContent(node: any): string {
    if (node.textContent) {
      return node.textContent.trim();
    }
    
    // Extract text from child text nodes
    let text = '';
    if (node.childNodes && Array.isArray(node.childNodes)) {
      node.childNodes.forEach((child: any) => {
        if (child.nodeType === 3 && child.textContent) { // Text node
          text += child.textContent.trim() + ' ';
        }
      });
    }
    
    return text.trim();
  }

  private hasChildWithTag(node: any, tagName: string): boolean {
    if (!node.childNodes || !Array.isArray(node.childNodes)) {
      return false;
    }

    return node.childNodes.some((child: any) => 
      child.tagName?.toLowerCase() === tagName.toLowerCase()
    );
  }

  private hasChildWithClass(node: any, classNames: string[]): boolean {
    if (!node.childNodes || !Array.isArray(node.childNodes)) {
      return false;
    }

    return node.childNodes.some((child: any) => {
      const childClassName = this.getClassString(child).toLowerCase();
      return classNames.some(cls => childClassName.includes(cls));
    });
  }
}