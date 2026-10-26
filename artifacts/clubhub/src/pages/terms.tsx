import { Link } from "wouter";
import { LegalContact, LegalLayout } from "@/components/legal/legal-layout";

export default function Terms() {
  return (
    <LegalLayout title="Terms of Use" description="Conditions for using Nahreo, including accounts, junior participation, team information, service limitations and Australian consumer rights.">
      <h2>Using Nahreo</h2>
      <p>These terms describe the conditions on which Nahreo is offered. A separate club service agreement, if agreed, may contain additional terms. You must have authority before accepting obligations for a club or another person. Nothing in these terms treats a child&apos;s use as consent to obligations they cannot lawfully accept.</p>
      <p>Nahreo helps clubs and teams organise people, events, availability, communication, feedback and optional player monitoring. We provide software, not club management, medical services, coaching accreditation or emergency monitoring. Clubs remain responsible for their activities and decisions.</p>

      <h2>Accounts, invitations and children</h2>
      <p>Provide accurate information and protect your sign-in details. Do not share accounts or impersonate others. One person&apos;s account may connect to multiple teams and clubs; use an existing account rather than creating a duplicate identity. Club creation requires operator authorisation. Joining a team or receiving a role requires appropriate authorisation; registration alone does not grant club access or staff permissions.</p>
      <p>A parent or authorised guardian should arrange and supervise under-13 participation. Arrangements for older minors must also be age-appropriate and lawful. Guardians may act only within their authority. Clubs must verify roles, guardian relationships and required consent, and must not use Nahreo to bypass safeguarding obligations. Contact us before creating a child login or entering sensitive information if those arrangements are unclear.</p>

      <h2>Your responsibilities</h2>
      <p>Use Nahreo lawfully and respectfully. Do not harass or exploit others; share unlawful or harmful content; misuse children&apos;s information; access records without authority; send spam; disclose personal information without a proper basis; interfere with security; or use the service for unlawful surveillance or discriminatory profiling. Invite people into staff roles only if authorised. Monitoring information must be used for legitimate, disclosed purposes and protected against unauthorised disclosure.</p>

      <h2>Content and privacy</h2>
      <p>You retain rights you have in submitted content. You give the operator limited, non-exclusive permission to host, store, transmit, display and process it as necessary to provide and secure Nahreo and meet lawful obligations. This does not transfer ownership or permit selling personal information or training general-purpose AI models on it. You must have necessary rights and permissions for content you supply, including photographs and information about others.</p>
      <p>The <Link href="/privacy">Privacy Policy</Link> explains personal-information handling. Clubs must provide any additional notices and consent arrangements their activities require. These terms do not replace separate consent for sensitive information where required. Removing content or leaving a team may not remove copies already received by others, retained records or protected backups. Privacy requests remain subject to applicable law.</p>

      <h2>Monitoring, learning preferences and feedback</h2>
      <p>Wellness indicators, workload calculations, playing minutes, questionnaires and feedback depend on entered information and may be incomplete or inaccurate. They are not medical advice, diagnoses, injury predictions or substitutes for qualified professional judgment.</p>
      <p>Learning-preference results do not prove a fixed learning style or establish that matching instruction to a category improves learning. Coaches should discuss preferences and use varied methods, not labels that limit a person&apos;s opportunities.</p>
      <p>Nahreo is not an emergency or safeguarding-reporting service. Do not rely on a dashboard or notification being reviewed promptly. Use appropriate medical, emergency or safeguarding channels when needed. In Australia, call <strong>000</strong> for an emergency.</p>

      <h2>Fees and paid plans</h2>
      <p>Fees, subscription periods, renewals and cancellation conditions apply only if clearly disclosed and separately agreed with the authorised purchaser before purchase. These terms alone do not establish a subscription, auto-renewal, price or blanket no-refund policy. A club&apos;s arrangements with members are separate. Any paid offering must respect applicable consumer rights.</p>

      <h2>Availability and service changes</h2>
      <p>We aim to provide a useful, reliable service, but features may change and access may be interrupted by maintenance, faults, third-party outages or security events. These terms do not create a specific uptime or uninterrupted-access commitment and do not exclude non-excludable legal guarantees. Clubs should maintain independent arrangements for critical communications and safety information.</p>

      <h2>Leaving, suspension and account requests</h2>
      <p>You may leave a team through the available setting, subject to safeguards such as retaining a club administrator. Leaving one team does not remove unrelated memberships. It is not account deletion or erasure of all historical information. Contact <LegalContact /> about account closure, access or deletion.</p>
      <p>We may restrict or suspend access where reasonably necessary to address serious misuse, protect people or information, or comply with law. Where appropriate, we will explain the action and allow you to contact us for review. Clubs may manage memberships within their authority. Neither leaving nor suspension removes rights or obligations that must continue under law.</p>

      <h2>Intellectual property and liability</h2>
      <p>The operator and relevant licensors retain rights in Nahreo&apos;s software, design and branding. You may use the service as authorised; those rights are not transferred to you. Nothing here restricts rights that applicable law does not permit us to restrict.</p>
      <p>We do not exclude, restrict or modify consumer guarantees, remedies or other rights that cannot lawfully be excluded, including under the Australian Consumer Law. Responsibility for loss is determined under applicable law and any valid, separately agreed service terms. These terms do not impose an arbitrary dollar liability cap, broad user indemnity or waiver of child-safety responsibilities.</p>

      <h2>Changes, disputes and governing law</h2>
      <p>We will provide reasonable advance notice of material changes, normally at least 30 days where practicable, except for urgent legal, security or minor administrative changes. We will obtain fresh acceptance where required. You may contact us about changes or stop using the service without losing rights that cannot be excluded.</p>
      <p>Contact <LegalContact /> first so we can try to resolve a concern fairly. These terms are governed by the laws of the Australian Capital Territory and applicable Commonwealth laws of Australia, subject to mandatory protections that apply elsewhere. Nothing requires you to bring a claim in a particular court where that would restrict a right that cannot lawfully be excluded.</p>
    </LegalLayout>
  );
}
