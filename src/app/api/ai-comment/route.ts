import { NextResponse } from "next/server";

type CatData = { icon: string; name: string; spent: number; prevSpent: number; budget: number | null };
type TrendData = { month: string; total: number };

export async function POST(req: Request) {
  const { period, totalSpent, catBreakdown, monthlyTrend } = await req.json() as {
    period: string;
    totalSpent: number;
    catBreakdown: CatData[];
    monthlyTrend: TrendData[];
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ comment: "APIキーが設定されていません。" }, { status: 500 });
  }

  const spendingSummary = catBreakdown.map((c) =>
    `${c.icon}${c.name}: 今月¥${c.spent.toLocaleString()}${c.prevSpent > 0 ? ` (先月¥${c.prevSpent.toLocaleString()})` : ""}${c.budget ? ` [予算¥${c.budget.toLocaleString()}]` : ""}`
  ).join("\n");

  const trendSummary = monthlyTrend.map((m) => `${m.month}: ¥${m.total.toLocaleString()}`).join(", ");

  const userMessage = `${period}の消費データ:
合計: ¥${totalSpent.toLocaleString()}

カテゴリ別:
${spendingSummary || "データなし"}

月間推移: ${trendSummary}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: `あなたは「マネ吉」という名前のAIファイナンシャルパートナーです。
キャラクター: 🐥ひよこのキャラ。明るくて親しみやすい口調。ため口で話す。
役割: ユーザー（俊樹さん、20代男性）の消費データを見て、簡潔で実用的なアドバイスや気づきを一言コメントする。
ルール:
- 2〜3文で簡潔に
- 具体的な数字に言及する
- 褒めるところは褒め、気になるところは優しく指摘
- 絵文字は1〜2個まで
- 「マネ吉だよ！」などの自己紹介は不要、いきなり本題に入る`,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const data = await res.json();
    if (data.error) {
      console.error("Anthropic API error:", data.error);
      return NextResponse.json({ comment: `APIエラー: ${data.error.message || JSON.stringify(data.error)}` });
    }
    const comment = data.content?.[0]?.text || "分析できませんでした。";
    return NextResponse.json({ comment });
  } catch (e) {
    console.error("ai-comment error:", e);
    return NextResponse.json({ comment: `エラーが発生しました: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
