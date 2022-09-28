import * as lunr from "lunr";

import { CipherService } from "../abstractions/cipher.service";
import { I18nService } from "../abstractions/i18n.service";
import { LogService } from "../abstractions/log.service";
import { SearchService as SearchServiceAbstraction } from "../abstractions/search.service";
import { CipherType } from "../enums/cipherType";
import { FieldType } from "../enums/fieldType";
import { UriMatchType } from "../enums/uriMatchType";
import { CipherView } from "../models/view/cipherView";
import { SendView } from "../models/view/sendView";

export class SearchService implements SearchServiceAbstraction {
  private static registeredPipeline = false;

  indexedEntityId?: string = null;
  private indexing = false;
  private index: lunr.Index = null;
  private readonly immediateSearchLocales: string[] = ["zh-CN", "zh-TW", "ja", "ko", "vi"];
  private readonly defaultSearchableMinLength: number = 2;
  private searchableMinLength: number = this.defaultSearchableMinLength;

  constructor(
    private cipherService: CipherService,
    private logService: LogService,
    private i18nService: I18nService
  ) {
    this.i18nService.locale$.subscribe((locale) => {
      if (this.immediateSearchLocales.indexOf(locale) !== -1) {
        this.searchableMinLength = 1;
      } else {
        this.searchableMinLength = this.defaultSearchableMinLength;
      }
    });

    // Currently have to ensure this is only done a single time. Lunr allows you to register a function
    // multiple times but they will add a warning message to the console. The way they do that breaks when ran on a service worker.
    if (!SearchService.registeredPipeline) {
      SearchService.registeredPipeline = true;
      //register lunr pipeline function
      lunr.Pipeline.registerFunction(this.normalizeAccentsPipelineFunction, "normalizeAccents");
    }
  }

  clearIndex(): void {
    this.indexedEntityId = null;
    this.index = null;
  }

  isSearchable(query: string): boolean {
    query = SearchService.normalizeSearchQuery(query);
    const notSearchable =
      query == null ||
      (this.index == null && query.length < this.searchableMinLength) ||
      (this.index != null && query.length < this.searchableMinLength && query.indexOf(">") !== 0);
    return !notSearchable;
  }

  async indexCiphers(indexedEntityId?: string, ciphers?: CipherView[]): Promise<void> {
    if (this.indexing) {
      return;
    }

    this.indexing = true;
    this.indexedEntityId = indexedEntityId;
    this.index = null;
    const builder = new lunr.Builder();
    builder.pipeline.add(this.normalizeAccentsPipelineFunction);
    builder.ref("id");
    builder.field("shortid", { boost: 100, extractor: (c: CipherView) => c.id.substr(0, 8) });
    builder.field("name", {
      boost: 10,
    });
    builder.field("subtitle", {
      boost: 5,
      extractor: (c: CipherView) => {
        if (c.subTitle != null && c.type === CipherType.Card) {
          return c.subTitle.replace(/\*/g, "");
        }
        return c.subTitle;
      },
    });
    builder.field("notes");
    builder.field("login.username", {
      extractor: (c: CipherView) =>
        c.type === CipherType.Login && c.login != null ? c.login.username : null,
    });
    builder.field("login.uris", { boost: 2, extractor: (c: CipherView) => this.uriExtractor(c) });
    builder.field("fields", { extractor: (c: CipherView) => this.fieldExtractor(c, false) });
    builder.field("fields_joined", { extractor: (c: CipherView) => this.fieldExtractor(c, true) });
    builder.field("attachments", {
      extractor: (c: CipherView) => this.attachmentExtractor(c, false),
    });
    builder.field("attachments_joined", {
      extractor: (c: CipherView) => this.attachmentExtractor(c, true),
    });
    builder.field("organizationid", { extractor: (c: CipherView) => c.organizationId });
    ciphers = ciphers || (await this.cipherService.getAllDecrypted());
    ciphers.forEach((c) => builder.add(c));
    this.index = builder.build();

    this.indexing = false;

    this.logService.info("Finished search indexing");
  }

  async searchCiphers(
    query: string,
    filter: ((cipher: CipherView) => boolean) | ((cipher: CipherView) => boolean)[] = null,
    ciphers: CipherView[] = null
  ): Promise<CipherView[]> {
    const results: CipherView[] = [];
    if (query != null) {
      query = SearchService.normalizeSearchQuery(query.trim().toLowerCase());
    }
    if (query === "") {
      query = null;
    }

    if (ciphers == null) {
      ciphers = await this.cipherService.getAllDecrypted();
    }

    if (filter != null && Array.isArray(filter) && filter.length > 0) {
      ciphers = ciphers.filter((c) => filter.every((f) => f == null || f(c)));
    } else if (filter != null) {
      ciphers = ciphers.filter(filter as (cipher: CipherView) => boolean);
    }

    if (!this.isSearchable(query)) {
      return ciphers;
    }

    if (this.indexing) {
      await new Promise((r) => setTimeout(r, 250));
      if (this.indexing) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const index = this.getIndexForSearch();
    if (index == null) {
      // Fall back to basic search if index is not available
      return this.searchCiphersBasic(ciphers, query);
    }

    const ciphersMap = new Map<string, CipherView>();
    ciphers.forEach((c) => ciphersMap.set(c.id, c));

    let searchResults: lunr.Index.Result[] = null;
    const isQueryString = query != null && query.length > 1 && query.indexOf(">") === 0;
    if (isQueryString) {
      try {
        searchResults = index.search(query.substr(1).trim());
      } catch (e) {
        this.logService.error(e);
      }
    } else {
      const soWild = lunr.Query.wildcard.LEADING | lunr.Query.wildcard.TRAILING;
      searchResults = index.query((q) => {
        lunr.tokenizer(query).forEach((token) => {
          const t = token.toString();
          q.term(t, { fields: ["name"], wildcard: soWild });
          q.term(t, { fields: ["subtitle"], wildcard: soWild });
          q.term(t, { fields: ["login.uris"], wildcard: soWild });
          q.term(t, {});
        });
      });
    }

    if (searchResults != null) {
      searchResults.forEach((r) => {
        if (ciphersMap.has(r.ref)) {
          results.push(ciphersMap.get(r.ref));
        }
      });
    }
    return results;
  }

  searchCiphersBasic(ciphers: CipherView[], query: string, deleted = false) {
    query = SearchService.normalizeSearchQuery(query.trim().toLowerCase());
    return ciphers.filter((c) => {
      if (deleted !== c.isDeleted) {
        return false;
      }
      if (c.name != null && c.name.toLowerCase().indexOf(query) > -1) {
        return true;
      }
      if (query.length >= 8 && c.id.startsWith(query)) {
        return true;
      }
      if (c.subTitle != null && c.subTitle.toLowerCase().indexOf(query) > -1) {
        return true;
      }
      if (
        c.login &&
        c.login.hasUris &&
        c.login.uris.some((loginUri) => loginUri?.uri?.toLowerCase().indexOf(query) > -1)
      ) {
        return true;
      }
      return false;
    });
  }

  searchSends(sends: SendView[], query: string) {
    query = SearchService.normalizeSearchQuery(query.trim().toLocaleLowerCase());
    if (query === null) {
      return sends;
    }
    const sendsMatched: SendView[] = [];
    const lowPriorityMatched: SendView[] = [];
    sends.forEach((s) => {
      if (s.name != null && s.name.toLowerCase().indexOf(query) > -1) {
        sendsMatched.push(s);
      } else if (
        query.length >= 8 &&
        (s.id.startsWith(query) ||
          s.accessId.toLocaleLowerCase().startsWith(query) ||
          (s.file?.id != null && s.file.id.startsWith(query)))
      ) {
        lowPriorityMatched.push(s);
      } else if (s.notes != null && s.notes.toLowerCase().indexOf(query) > -1) {
        lowPriorityMatched.push(s);
      } else if (s.text?.text != null && s.text.text.toLowerCase().indexOf(query) > -1) {
        lowPriorityMatched.push(s);
      } else if (s.file?.fileName != null && s.file.fileName.toLowerCase().indexOf(query) > -1) {
        lowPriorityMatched.push(s);
      }
    });
    return sendsMatched.concat(lowPriorityMatched);
  }

  getIndexForSearch(): lunr.Index {
    return this.index;
  }

  private fieldExtractor(c: CipherView, joined: boolean) {
    if (!c.hasFields) {
      return null;
    }
    let fields: string[] = [];
    c.fields.forEach((f) => {
      if (f.name != null) {
        fields.push(f.name);
      }
      if (f.type === FieldType.Text && f.value != null) {
        fields.push(f.value);
      }
    });
    fields = fields.filter((f) => f.trim() !== "");
    if (fields.length === 0) {
      return null;
    }
    return joined ? fields.join(" ") : fields;
  }

  private attachmentExtractor(c: CipherView, joined: boolean) {
    if (!c.hasAttachments) {
      return null;
    }
    let attachments: string[] = [];
    c.attachments.forEach((a) => {
      if (a != null && a.fileName != null) {
        if (joined && a.fileName.indexOf(".") > -1) {
          attachments.push(a.fileName.substr(0, a.fileName.lastIndexOf(".")));
        } else {
          attachments.push(a.fileName);
        }
      }
    });
    attachments = attachments.filter((f) => f.trim() !== "");
    if (attachments.length === 0) {
      return null;
    }
    return joined ? attachments.join(" ") : attachments;
  }

  private uriExtractor(c: CipherView) {
    if (c.type !== CipherType.Login || c.login == null || !c.login.hasUris) {
      return null;
    }
    const uris: string[] = [];
    c.login.uris.forEach((u) => {
      if (u.uri == null || u.uri === "") {
        return;
      }
      if (u.hostname != null) {
        uris.push(u.hostname);
        return;
      }
      let uri = u.uri;
      if (u.match !== UriMatchType.RegularExpression) {
        const protocolIndex = uri.indexOf("://");
        if (protocolIndex > -1) {
          uri = uri.substr(protocolIndex + 3);
        }
        const queryIndex = uri.search(/\?|&|#/);
        if (queryIndex > -1) {
          uri = uri.substring(0, queryIndex);
        }
      }
      uris.push(uri);
    });
    return uris.length > 0 ? uris : null;
  }

  private normalizeAccentsPipelineFunction(token: lunr.Token): any {
    const searchableFields = ["name", "login.username", "subtitle", "notes"];
    const fields = (token as any).metadata["fields"];
    const checkFields = fields.every((i: any) => searchableFields.includes(i));

    if (checkFields) {
      return SearchService.normalizeSearchQuery(token.toString());
    }

    return token;
  }

  // Remove accents/diacritics characters from text. This regex is equivalent to the Diacritic unicode property escape, i.e. it will match all diacritic characters.
  static normalizeSearchQuery(query: string): string {
    return query?.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
}
