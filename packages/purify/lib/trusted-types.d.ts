// Ported from the interfaces of @types/trusted-types (MIT) that DOMPurify's declarations name by tools/port-purify/port.js: do not edit, change the tool.
export declare class TrustedHTML {
  private readonly brand: true;
}
export declare class TrustedScript {
  private readonly brand: true;
}
export declare class TrustedScriptURL {
  private readonly brand: true;
}
export interface TrustedTypePolicyOptions {
  createHTML?: ((input: string, ...args: any[]) => string) | undefined;
  createScript?: ((input: string, ...args: any[]) => string) | undefined;
  createScriptURL?: ((input: string, ...args: any[]) => string) | undefined;
}
export declare class TrustedTypePolicy {
  readonly name: string;
  createHTML(input: string, ...args: any[]): TrustedHTML;
  createScript(input: string, ...args: any[]): TrustedScript;
  createScriptURL(input: string, ...args: any[]): TrustedScriptURL;
}
export declare class TrustedTypePolicyFactory {
  createPolicy(policyName: string, policyOptions?: TrustedTypePolicyOptions): TrustedTypePolicy;
  isHTML(value: unknown): value is TrustedHTML;
  getAttributeType(tagName: string, attribute: string, elementNs?: string, attrNs?: string): string | null;
}
export interface TrustedTypesWindow {
  trustedTypes?: TrustedTypePolicyFactory | undefined;
}
declare global {
  type TrustedTypePolicyFactory = import('./trusted-types.js').TrustedTypePolicyFactory;
  type TrustedTypePolicy = import('./trusted-types.js').TrustedTypePolicy;
}
