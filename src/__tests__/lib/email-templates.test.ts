import { emailTemplates } from "@/lib/email-templates";

describe("emailTemplates.newMessage", () => {
  it("renders the complete new-message payload with escaped body fields", () => {
    const rendered = emailTemplates.newMessage({
      recipientName: "<Host>",
      senderName: 'Guest & "Sender"',
      listingTitle: "Sunny <Loft>",
      messagePreview: "Hi <script>alert(1)</script> & thanks",
      conversationId: "conv/123?x=<bad>",
    });

    expect(rendered.subject).toBe('New message from Guest & "Sender"');
    expect(rendered.html).toContain("Hi &lt;Host&gt;,");
    expect(rendered.html).toContain(
      "<strong>Guest &amp; &quot;Sender&quot;</strong>"
    );
    expect(rendered.html).toContain(
      '<strong>"Sunny &lt;Loft&gt;"</strong>'
    );
    expect(rendered.html).toContain(
      "Hi &lt;script&gt;alert(1)&lt;/script&gt; &amp; thanks"
    );
    expect(rendered.html).toContain(
      "/messages/conv%2F123%3Fx%3D%3Cbad%3E"
    );
    expect(rendered.html).not.toContain("<script>alert(1)</script>");
    expect(rendered.html).not.toContain("Sunny <Loft>");
  });
});
