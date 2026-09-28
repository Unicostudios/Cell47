/*
 * Settings page — shown in the Fitbit app (Clock Faces → this face → Settings).
 * Values are stored in settingsStorage and read by companion/index.js.
 */
function SyncSettings(props) {
  const status = props.settingsStorage.getItem("syncStatus") || "Not synced yet";
  return (
    <Page>
      <Section
        title={<Text bold align="center">Ops Desk dashboard sync</Text>}
        description={
          <Text>
            Sends steps, calories, heart rate and sleep to your "Fitbit Stats"
            Notion page every ~15 minutes, where your dashboard reads them.
          </Text>
        }
      >
        <TextInput
          label="Notion secret key"
          placeholder="secret_… or ntn_…"
          settingsKey="notionToken"
        />
        <TextInput
          label="Fitbit Stats page link (optional)"
          placeholder="Leave empty to use the page created for you"
          settingsKey="notionPage"
        />
        <Text italic>{status}</Text>
      </Section>
    </Page>
  );
}

registerSettingsPage(SyncSettings);
