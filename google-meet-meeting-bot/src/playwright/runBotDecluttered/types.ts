
import { Page, BrowserContext } from "playwright";

export interface BotContext {
    page: Page;
    context: BrowserContext;
}
