import { LegalContact, LegalLayout } from "@/components/legal/legal-layout";

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" description="How Nahreo handles account, club, player and guardian information, Google sign-in, and privacy requests.">
      <h2>What this policy covers</h2>
      <p>Nahreo provides club and team administration, communication, scheduling, participation and coaching tools. This policy explains how the operator handles personal information through Nahreo. Your club also decides what information it enters, who it invites and how it uses team records. Clubs must explain their own practices and have appropriate authority and consent. Contact us if you are unsure whether a request should go to Nahreo, your club, or both.</p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Identity and account details:</strong> name, email address, login identifier, profile photograph and optional information such as phone number, date of birth and biography where supplied.</li>
        <li><strong>Membership and family relationships:</strong> clubs, teams, roles, invitations and links between players and authorised guardians. Club staff may create roster records before a person signs in.</li>
        <li><strong>Team activity:</strong> events, opponents, venues, availability, participation responses, recorded playing minutes, posts, comments, messages and uploaded photographs.</li>
        <li><strong>Coaching and monitoring:</strong> feedback, assessments, reports, training effort and duration, additional activity and wellness answers such as sleep, energy, soreness, stress and mood where those features are used. Some of this may be sensitive or health information.</li>
        <li><strong>Learning preferences:</strong> questionnaire information and visual, auditory and kinesthetic preference summaries. These are self-reported preferences, not diagnoses or fixed measures of ability.</li>
        <li><strong>Technical information:</strong> authentication and security records, request/device information processed by our infrastructure, notification preferences and push-subscription details if notifications are enabled.</li>
      </ul>
      <p>Information comes from you, authorised guardians, club staff and people who contribute content or records about you. Do not upload another person&apos;s information without a proper basis. Optional features may not work if you do not provide the information they need.</p>

      <h2>Google sign-in and Google data</h2>
      <p>If you choose Google sign-in, Google and our authentication provider, Clerk, process that login. Basic identity information made available for sign-in, such as your Google account identifier, name, email address and profile image, is used to authenticate you and connect you to your Nahreo account. Nahreo does not receive your Google password.</p>
      <p>Nahreo requests basic identity, email and profile permissions for sign-in, not access to Gmail messages, Drive files or contacts. Google identity data is used for account creation, authentication, account linking and related security and support—not advertising or unrelated profiling. We do not sell Google user data or use it to train general-purpose AI models.</p>
      <p>Google data is shared only as necessary with providers that support these functions, where you authorise it, or where required or permitted by law. Access is limited to providing the service, authorised support, security and lawful obligations. Our use of Google data must comply with the applicable <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including Limited Use requirements where applicable.</p>
      <p>You can manage or revoke the connection through your Google account. Revoking it does not delete your Nahreo records and may affect your ability to sign in. Contact us separately about deletion.</p>

      <h2>How we use information</h2>
      <p>We use information to provide accounts and authorised club access; deliver events, messages, invitations and requested notifications; support coaching and player feedback; maintain records across team memberships; respond to support and privacy requests; and protect the service against misuse. We also handle information where required or permitted by law. We do not sell personal information or use player wellness or learning-preference information for advertising.</p>
      <p>Wellness and monitoring support conversations and coaching, not medical diagnosis or automated decisions about a person&apos;s future. Sensitive information requires appropriate informed consent or another lawful basis. Accepting general terms is not a substitute for consent where separate consent is required. Clubs and guardians should discuss optional collection and visibility before entering sensitive information. Contact the club and us if the purpose or consent arrangements are unclear.</p>

      <h2>Who can see information</h2>
      <p>Access depends on the feature, role, team/club membership and available privacy settings. Posts and messages are shared with their intended audience. Authorised staff can access roster and coaching information for their responsibilities. Linked guardians may access or act on behalf of a player where permitted. Contact-detail settings affect visibility; check those settings before assuming a supplied phone number or email is private.</p>
      <p>Recorded playing-minute figures are for authorised coaches and administrators, not players or parents. Player learning-preference summaries support authorised coaching. A coach&apos;s learning-preference results are restricted to that coach and authorised club administrators.</p>
      <p>Joining Nahreo does not make all your information public. However, recipients may save reports, take screenshots or share information outside the service. Clubs and recipients must protect information they access. The operator may access relevant information where necessary for support, security or legal purposes.</p>

      <h2>Service providers and overseas handling</h2>
      <p>Providers receive information necessary for their functions:</p>
      <ul>
        <li><strong>Railway:</strong> production application and database hosting, including stored account and team information.</li>
        <li><strong>Clerk:</strong> authentication, identity, sessions, verification and associated security information.</li>
        <li><strong>Google:</strong> optional Google sign-in and associated identity/security processing when selected.</li>
        <li><strong>Resend:</strong> transactional email delivery, including recipient details and necessary message content.</li>
        <li><strong>Browser/device push providers:</strong> subscription identifiers and notification payloads for enabled push notifications; the provider depends on your browser/device. Notifications may appear on lock screens.</li>
        <li><strong>Replit:</strong> development and testing. Relevant information may be accessible for authorised development or support; this is not an unrestricted permission to copy production data.</li>
      </ul>
      <p>Our providers operate internationally. Information may be processed outside Australia, including in the United States and other countries used by the relevant provider and its subprocessors. Destinations depend on hosting, delivery and support arrangements, and we do not promise Australian-only storage. Contact us for current information about overseas handling relevant to your records. We consider applicable privacy obligations when arranging provider access.</p>
      <p>We may also disclose information to authorised club participants, people you authorise, or authorities and advisers where required or permitted by law. Unrelated clubs do not receive private records merely because they also use Nahreo.</p>

      <h2>Children and guardians</h2>
      <p>Nahreo supports junior players, including children under 13. A parent or authorised guardian should arrange and supervise an under-13 player&apos;s participation. Clubs must verify authority, provide age-appropriate explanations and obtain required consent before entering children&apos;s information, particularly sensitive information or photographs. Older minors also require age-appropriate arrangements based on their maturity and applicable law.</p>
      <p>A player&apos;s permanent record is separate from the guardian&apos;s account. Technical guardian links and login access do not, on their own, prove parental authority or informed consent. Do not create an independent child login or enter sensitive information unless suitable arrangements are in place. Contact us and the club if an arrangement is unclear.</p>
      <p>Contact us to challenge an incorrect guardian link or report collection without appropriate authority. We will investigate and take appropriate action, which may include restricting access, correction or removal. Clubs must maintain appropriate safeguarding procedures for communication, photographs and monitoring.</p>

      <h2>Security, cookies and device storage</h2>
      <p>Nahreo uses authenticated access and role checks. Clerk handles password authentication; Nahreo does not need your plain-text password. Uploaded images are served through access-controlled, expiring links. No internet service can guarantee complete security.</p>
      <p>Authentication cookies and browser storage support sign-in, club/team selection, preferences and installed-web-app operation. Push notifications require browser/device permission and can be disabled in the available app and device settings. Device privacy settings can affect sign-in persistence. Nahreo does not use player information for advertising tracking.</p>

      <h2>Retention, leaving a team and deletion</h2>
      <p>Leaving a team removes the relevant membership access; it does not delete the permanent account or automatically erase historical records. Other memberships remain, and authorised guardian access may continue independently. Leaving the final team removes club access where no other access remains, subject to safeguards.</p>
      <p>Retention depends on the purpose of the record, continued account use, club recordkeeping needs, sensitivity, security requirements and lawful obligations. Historical information is not retained simply because it might be useful indefinitely. Deletion or de-identification requests are assessed separately from leaving a team, and some records may need to remain for legitimate or legal reasons. Protected backup copies may persist until replaced through the provider&apos;s backup cycle. Contact us about the retention applicable to a particular record or to request its removal.</p>
      <p>We do not promise that leaving a team, revoking Google access or uninstalling the app deletes information. Privacy requests are handled through the contact below rather than assuming those actions close an account.</p>

      <h2>Access, correction, deletion and complaints</h2>
      <p>Contact <LegalContact /> to request access or correction, ask for a copy of your information, request deletion or withdrawal from optional processing, or make a privacy complaint. We may verify your identity and authority, particularly for a child&apos;s records. Some requests need consultation with the club. We will explain if we cannot meet a request and the available next steps, subject to law.</p>
      <p>Where applicable, unresolved complaints may be raised with the <a href="https://www.oaic.gov.au/privacy/privacy-complaints">Office of the Australian Information Commissioner</a> or another relevant regulator. This policy does not limit rights under applicable law.</p>

      <h2>Changes to this policy</h2>
      <p>We will update the effective date when this policy changes. For significant changes, we will notify affected users through a suitable in-app or email notice before the change takes effect where practicable, and seek fresh consent where required. Urgent legal or security changes may apply sooner. Updated wording does not retrospectively authorise an unrelated use of information.</p>
    </LegalLayout>
  );
}
