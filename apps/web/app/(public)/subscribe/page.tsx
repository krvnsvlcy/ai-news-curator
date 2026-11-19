import { newsletterOptions } from "@/lib/newsletter-config";
import { SubscribeForm } from "./subscribe-form";

export const metadata = { title: "Subscribe" };

export default function SubscribePage() {
  const { publicationName } = newsletterOptions();
  return (
    <>
      <h1 className="mt-8 font-serif text-[34px] leading-tight font-bold tracking-tight">
        The news, with a raised eyebrow.
      </h1>
      <p className="mt-3 font-serif text-[18px] leading-relaxed text-[#333]">
        {publicationName} is a short daily email: the day's UK news in one briefing, and the stories
        worth reading with headlines that say what everyone's thinking.
      </p>
      <SubscribeForm />
    </>
  );
}
