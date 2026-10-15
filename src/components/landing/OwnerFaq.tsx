import type { ReactNode } from "react";
import { ChevronDown, ClipboardList } from "lucide-react";
import { Section } from "./Section";

interface CostRow {
  item: string;
  amount: string;
  note: string;
}

// All amounts in yen (1ドル＝150円で計算). Keep in sync with docs/PRODUCTION.md §9.
const COSTS: CostRow[] = [
  { item: "LINE公式アカウント", amount: "0円〜", note: "無料のプランから始められます。" },
  {
    item: "グループへの自動返信",
    amount: "0円",
    note: "返信はLINEの送信数に数えられないため、いくら増えても費用はかかりません。",
  },
  {
    item: "管理者への転送",
    amount: "無料通数内は0円",
    note: "別のグループへの転送は、そのグループの人数分が送信数に数えられます（無料プランは月200通まで）。転送が多い場合は月5,000円のプランが必要になることがあります。メールやChatworkへの通知にすれば、この費用はかかりません。",
  },
  {
    item: "AIの利用料",
    amount: "月数百円〜4,000円程度",
    note: "AIが読む投稿の数で変わります。1日10件ほどなら月数百円〜1,500円、30件ほどなら月1,000〜4,000円が目安です。短いあいさつ、写真だけの投稿、緊急の言葉を含む投稿、管理者の発言はAIを使わないため、費用はかかりません。少し軽いAIに切り替えると、費用はおよそ半分になります。",
  },
  {
    item: "サーバー代",
    amount: "お試しは0円／本番は月3,000円程度",
    note: "サーバーの無料プランは個人の非商用利用に限られるため、事業として本番運用する場合は有料プランをおすすめします。",
  },
];

function CostTable() {
  return (
    <dl className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {COSTS.map((row) => (
        <div key={row.item} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
          <dt className="text-[13px] font-semibold text-slate-800">{row.item}</dt>
          <dd className="text-[13px] leading-relaxed text-slate-600">
            <span className="mr-2 font-bold text-brand-800">{row.amount}</span>
            {row.note}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface FaqItem {
  q: string;
  a: ReactNode;
}

const FAQS: FaqItem[] = [
  {
    q: "運用にかかる費用はどのくらいですか？",
    a: (
      <>
        <p>毎月かかる費用の目安は次の通りです。</p>
        <CostTable />
        <p className="mt-3 text-xs text-slate-500">
          ※ 夜間の電話での呼び出しを使う場合は、別途、通話サービスの利用料がかかります。
        </p>
      </>
    ),
  },
  {
    q: "お客様の情報が、AIの学習に使われることはありませんか？",
    a: (
      <p>
        ありません。本番では、送った内容がAIの学習に使われない形のAIサービスを利用します。コールセンターからの連絡にお客様の情報が含まれていても、学習のデータとして使われることはありません。やりとりの記録をどこに、どのくらいの期間残すかも、ご要望に合わせて決められます。
      </p>
    ),
  },
  {
    q: "このデモで入力した内容は、どこに保存されますか？",
    a: (
      <p>
        お使いのブラウザの中だけに保存され、外部のサーバーには送信されません。サンプルのAI判定も、ブラウザの中で動いています。メニューの「デモをリセット」で、いつでも最初の状態に戻せます。別のパソコンやスマートフォンでは、それぞれ最初の状態から始まります。
      </p>
    ),
  },
  {
    q: "画面に「AI判定（サンプル）」と出るのはなぜですか？",
    a: (
      <p>
        本番のAIにつなぐ前のため、あらかじめ決めた判定ルールで動く「サンプルのAI」が判定しています。本番では、AIにつなぐ設定をするだけで、AIが文章の意味を読み取って判定する方式に切り替わり、言い回しが違っても意味で判断できるようになります。なお、緊急の条件に当てはまるものは、AIの判断にかかわらず必ず緊急として扱います。
      </p>
    ),
  },
  {
    q: "AIが判断を間違えたら、どうなりますか？",
    a: (
      <p>
        自信が持てない内容は、自動で返信せずに「判定保留」として管理者へ回します。判定が違っていたものは、管理画面の判定ログで正しい分類を選ぶだけで、次から同じような内容はその判定になります。ただし安全のため、緊急の言葉を含む内容は、修正したあとも緊急として扱います。
      </p>
    ),
  },
  {
    q: "スタッフが新しく覚えることはありますか？",
    a: (
      <p>
        ありません。いつものLINEグループに、これまで通り投稿していただくだけです。写真とコメントを別々に送っても、ひとつの報告としてまとめて扱います。
      </p>
    ),
  },
  {
    q: "夜間や休日も、自動で対応できますか？",
    a: (
      <p>
        はい。24時間、自動で返信・転送します。夜間（初期設定では22時〜翌朝8時）に緊急のトラブルがあった場合は、電話での呼び出しも行えます。時間帯や通知先は管理画面で変更できます。
      </p>
    ),
  },
];

const PREP_QUESTIONS = [
  "グループは、清掃スタッフ用とコールセンター用で分かれていますか？",
  "店舗の数と、1日のおおよそのメッセージ数",
  "緊急時の通知先（LINE・電話・メールなど）",
  "夜間も自動で対応させたいかどうか",
];

export function OwnerFaq() {
  return (
    <Section
      id="faq"
      eyebrow="よくあるご質問"
      title="導入前に気になる点にお答えします"
      description="ほかにも気になる点があれば、お気軽にお問い合わせください。"
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10">
        <div className="space-y-3">
          {FAQS.map((item, i) => (
            <details
              key={item.q}
              open={i === 0}
              className="group rounded-2xl border border-slate-200 bg-white shadow-sm open:shadow-md"
            >
              <summary className="flex min-h-14 list-none items-center gap-3 rounded-2xl px-4 py-3.5 text-left sm:px-5">
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-bold text-brand-700 ring-1 ring-brand-200"
                >
                  Q
                </span>
                <span className="min-w-0 flex-1 text-[15px] font-bold text-slate-900">{item.q}</span>
                <ChevronDown
                  className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="px-4 pb-5 text-sm leading-relaxed text-slate-700 sm:pl-15 sm:pr-6">{item.a}</div>
            </details>
          ))}
        </div>

        <aside
          aria-labelledby="prep-heading"
          className="rounded-2xl border border-brand-200 bg-linear-to-b from-brand-50 to-white p-5 lg:sticky lg:top-[calc(var(--app-header-height)+1.5rem)]"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm ring-1 ring-brand-200">
            <ClipboardList className="size-5" aria-hidden />
          </span>
          <h3 id="prep-heading" className="mt-4 text-base font-bold text-slate-900">
            本番に向けて、教えていただきたいこと
          </h3>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
            次の4点がわかると、より具体的な設計と費用の目安をお伝えできます。
          </p>
          <ol className="mt-4 space-y-3">
            {PREP_QUESTIONS.map((question, i) => (
              <li key={question} className="flex gap-3 text-[13px] leading-relaxed text-slate-800">
                <span
                  aria-hidden
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white"
                >
                  {i + 1}
                </span>
                <span className="pt-0.5">{question}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </Section>
  );
}
