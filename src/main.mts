import type { ContractTag, ITagService } from "atq-types";
import fetch from "node-fetch";

// Messari's official deployment catalogue: https://github.com/messari/subgraphs/blob/master/deployment/decentralized_network_deployments.csv
// Source subgraph: B35cLTayreXTML6fXPTrFNSYx7mKyDuuV51LjVxWwWjp. Publisher: subgraphs.messari.eth.
const endpoint = "https://gateway.thegraph.com/api/deployments/id/Qmb7S3fSHij3pej9yuXyNsuK2gGv4xmhaBcbfhuWRG7NJy";
type Token = { id: string; name: string; symbol: string };
type Row = { id: string; name?: string; symbol?: string; outputToken?: Token | null; inputToken?: Token; inputTokens?: Token[]; type?: string; expirationTimestamp?: string };

type Meta = { deployment: string; hasIndexingErrors: boolean; block: { number: number; hash: string } };
async function query(text: string, apiKey: string): Promise<Record<string, unknown>> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ query: text }), signal: controller.signal });
    if (!response.ok) throw new Error(`Graph HTTP ${response.status}`);
    const doc = await response.json() as { data?: Record<string, unknown>; errors?: unknown[] };
    if (!doc.data || doc.errors?.length) throw new Error("Graph returned errors or incomplete data");
    return doc.data;
  } finally { clearTimeout(timer); }
}
function checkMeta(value: unknown): Meta {
  const m = value as Meta;
  if (!m || m.deployment !== "Qmb7S3fSHij3pej9yuXyNsuK2gGv4xmhaBcbfhuWRG7NJy" || m.hasIndexingErrors !== false || !Number.isSafeInteger(m.block?.number) || m.block.number < 1 || !/^0x[0-9a-f]{64}$/i.test(m.block.hash)) throw new Error("Invalid deployment or source block");
  return m;
}
const service: ITagService = {
  async returnTags(chainId: string, apiKey: string | null): Promise<ContractTag[]> {
    if (chainId !== "43114") throw new Error(`Unsupported Chain ID: ${chainId}`);
    if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("A Graph API key is required");
    const initial = checkMeta((await query("{ _meta { deployment hasIndexingErrors block { number hash } } }", apiKey))._meta);
    const atBlock = `block: { hash: ${JSON.stringify(initial.block.hash)} }`;
    const tags: ContractTag[] = [], addresses = new Set<string>(), labels = new Set<string>();
    // Entity IDs have no unique sequential field. Use the policy's ID cursor fallback.
    // Only outputToken addresses become tags; pool entity IDs never do.
    let cursor = "";
    for (;;) {
      const doc = await query(`{ _meta(${atBlock}) { deployment hasIndexingErrors block { number hash } }
        liquidityPools(first: 1000, orderBy: id, orderDirection: asc, where: { id_gt: ${JSON.stringify(cursor)} }, ${atBlock}) { id name symbol outputToken { id name symbol } inputTokens { id name symbol } } }`, apiKey);
      const observed = checkMeta(doc._meta);
      if (observed.block.hash !== initial.block.hash || observed.block.number !== initial.block.number) throw new Error("Source snapshot changed");
      const rows = doc.liquidityPools;
      if (!Array.isArray(rows) || rows.length > 1000) throw new Error("Invalid entity page");
      if (!rows.length) break;
      for (const row of rows as Row[]) {
        if (typeof row.id !== "string" || row.id <= cursor) throw new Error("Cursor did not advance");
        cursor = row.id;
        const token = row.outputToken;
        // A virtual pool ID or an underlying asset is not a receipt token.
        if (!token) continue;
        if (typeof token.id !== "string" || !/^0x[0-9a-f]{40}$/i.test(token.id) || /^0x0{40}$/i.test(token.id)) throw new Error("Invalid receipt token address");
        const address = token.id.toLowerCase();
        if (addresses.has(address)) throw new Error("Repeated receipt token across source entities");
        addresses.add(address);
        if (!Array.isArray(row.inputTokens) || !row.inputTokens.length || row.inputTokens.some(t => typeof t.symbol !== "string")) throw new Error("Missing underlying pool tokens");
        const detail = `Pool assets: ${row.inputTokens.map(t => t.symbol).join(" / ")}.`;
        if (typeof token.name !== "string" || !token.name.trim() || typeof token.symbol !== "string") throw new Error("Missing contract token metadata");
        const name = token.name.trim().replace(/\s+/g, " ");
        if (/[`\r\n]|\*\*|<[^>]+>/.test(name + token.symbol + detail)) throw new Error("Metadata cannot produce a plain-text tag");
        const label = (name.length > 34 ? name.slice(0, 31) + "..." : name) + ` (${address.slice(2, 12)})`;
        if (labels.has(label)) throw new Error("Ambiguous tag label");
        labels.add(label);
        tags.push({ "Contract Address": `eip155:43114:${address}`, "Project Name": "Platypus Finance", "Public Name Tag": label,
          "UI/Website Link": "https://platypus.finance", "Public Note": `Platypus Finance liquidity deposit receipt token on Avalanche. Symbol: ${token.symbol}. ${detail} Includes historical assets; no claim that pools or deposits remain enabled.` });
      }
      if (rows.length < 1000) break;
    }
    return tags;
  },
};
export async function returnTags(chainId: string, apiKey: string): Promise<ContractTag[]> {
  return service.returnTags(chainId, apiKey);
}
