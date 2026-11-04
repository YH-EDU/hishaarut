import { useEffect, useState } from "react";
import { getApi } from "../api";
import { applyParentTemplate } from "../lib/messages";
import { WhatsAppButton } from "./WhatsAppButton";

type Who = "mother" | "father";

/** Teacher sends the parent update from their own WhatsApp. Mother first; father on request. */
export function ParentWhatsApp({
  detentionId,
  studentName,
  className,
  releaseTime,
  reason,
  template,
}: {
  detentionId: string;
  studentName: string;
  className: string;
  releaseTime: string;
  reason: string;
  template?: string | null;
}) {
  const [phones, setPhones] = useState<{ motherPhone: string | null; fatherPhone: string | null } | null>(null);
  const [who, setWho] = useState<Who>("mother");

  useEffect(() => {
    let live = true;
    getApi()
      .getDetentionParentPhones(detentionId)
      .then((value) => {
        if (!live) return;
        setPhones(value);
        setWho(value.motherPhone || !value.fatherPhone ? "mother" : "father");
      })
      .catch(() => live && setPhones({ motherPhone: null, fatherPhone: null }));
    return () => {
      live = false;
    };
  }, [detentionId]);

  if (!phones) return null;
  if (!phones.motherPhone && !phones.fatherPhone) {
    return <p className="muted parent-wa">אין טלפון הורה עם וואטסאפ. אפשר לעדכן את המזכירות.</p>;
  }
  const phone = who === "mother" ? phones.motherPhone : phones.fatherPhone;
  const message = applyParentTemplate(template, { parentName: null, studentName, className, releaseTime, reason });
  return (
    <div className="parent-wa">
      <span className="muted">עדכון להורים:</span>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={who === "mother"} disabled={!phones.motherPhone} onClick={() => setWho("mother")}>
          אמא
        </button>
        <button type="button" className="chip" aria-pressed={who === "father"} disabled={!phones.fatherPhone} onClick={() => setWho("father")}>
          אבא
        </button>
      </div>
      {phone ? <WhatsAppButton phone={phone} message={message} compact /> : null}
    </div>
  );
}
