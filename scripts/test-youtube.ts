import { getVideoInfo, getPlaylistInfo } from "../src/server/actions/youtube";

async function main() {
  console.log(await getVideoInfo("https://youtu.be/dQw4w9WgXcQ"));
  console.log(
    await getPlaylistInfo(
      "https://youtube.com/playlist?list=PL0_t-CnDX5T2dPzjB5pjAeXFbr7Cc-ZpK",
    ),
  );
}

main();
