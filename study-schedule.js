(function () {
  const pages = [73, 78, 83, 88, 92, 94, 99, 104, 109, 114, 115, 119, 124, 129, 134, 136, 141, 146, 151, 156, 158, 163, 167, 172, 176, 177, 182, 187, 192, 197, 199, 204, 209, 214, 219, 221, 226, 232, 237, 242, 244, 249, 254, 259, 264, 265, 270, 275, 280, 281, 285];
  const titles = [
    "Becoming a Trusted Soldier in the Lord’s Army — Joshua in the School of Divine Making",
    "Joshua: Kingdom Army Built in Courage, Wisdom, and the Spirit-Led Lifestyle",
    "Joshua’s Commissioning as God’s Army: Arising into God’s Ordained Assignment",
    "Possessing the Land for the Lord: Walking in Our Inheritance in Christ",
    "Tarry Week for Reflections and Prayer",
    "Rahab and the First Fruits of the Land: The Power of Redemption to Save All Men",
    "Crossing Jordan: Moving by Divine Leading into New Territories",
    "Memorial Stones: Preserving Revival Testimonies for the Next Generation",
    "Gilgal and the Circumcised Army: Consecration Before Victory",
    "Tarry Week for Reflections and Prayer",
    "The Captain of the Lord’s Host: Submitting the Battle to Christ — the Head",
    "Jericho and the Fall of Strongholds: Winning God’s Battle God’s Way",
    "Achan and Secret Sins: How Hidden Sin Brings Defeat and Shame",
    "Ai and the Mercy of Restoration: Rising Again After Failure",
    "Tarry Week for Reflections and Prayer",
    "Mount Ebal and the Altar of the Word: Returning Victory to Covenant Obedience",
    "The Gibeonite Deception: The Need for Discernment, Prayer, and the Danger of Unholy Alliances",
    "When Enemies Come Together: Standing Firm When Opposition Multiplies",
    "The Hidden Kings and Unfinished Battles: Giving No Place to the Devil",
    "Tarry Week for Reflections and Prayer",
    "The Northern Coalition: Deeper Consecration for Bigger Battles",
    "Joshua’s Long War: Endurance in Labouring for Lasting Revival",
    "The Defeated Kings: Remembering the Victories of Christ Over Every Power",
    "There Remaineth Yet Very Much Land: The Danger of Settling Too Early",
    "Tarry Week for Reflections and Prayer",
    "Dividing the Land: Stewarding Our Portion in the Body of Christ",
    "Give Me This Mountain: Inner Strength for the Possession of God’s Promise",
    "The Daughters of Zelophehad: Claiming Covenant Inheritance with Boldness",
    "Why Are Ye Slack? Redeeming the Time for God’s Assignment",
    "Tarry Week for Reflections and Prayer",
    "Setting the Boundaries: Serving God Faithfully in Your Assigned Portion",
    "Cities of Refuge: Building Communities of Mercy, Healing, and Restoration",
    "The Levites Among the People: Distributing Ministry Across Every Territory",
    "The God Who Fulfils Every Promise: Trusting God’s Faithfulness Over Every Inheritance",
    "Tarry Week for Reflections and Prayer",
    "The Eastern Tribes Returning Home: Carrying the Burden Beyond the Battlefield",
    "The Altar of Witness: Resolving Conflict God’s Way",
    "Keeping the Fire After the Battle Is Won",
    "One Shall Chase a Thousand: The Power Behind One Consecrated Life",
    "Tarry Week for Reflections and Prayer",
    "Take Good Heed Unto Yourselves: Loving God Sincerely in the Days of Blessing",
    "Not One Thing Hath Failed: Understanding Covenant Faithfulness",
    "Choose You This Day: Personal Choices and Godly Alignment of Personal Will",
    "We Will Serve the Lord: Turning Confession into Public Faith and Covenant Commitment",
    "Tarry Week for Reflections and Prayer",
    "Joshua’s Death: Raising Successors for Lasting Revival",
    "The Bones of Joseph: The Resurrection of the Dead and End-Time Truths",
    "The Priesthood of Eleazar: Standing as a Revival Priest Across Generations",
    "Tarry Week for Reflections and Prayer",
    "Summaries from Joshua, Part 1: The Consecration of an Exceeding Great Army",
    "Summaries from Joshua, Part 2: The Art of Spiritual Warfare"
  ];

  const oneDay = 86400000;
  const firstMonday = new Date(2026, 7, 31);
  firstMonday.setHours(0, 0, 0, 0);

  function formatRange(start, end) {
    const formatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
    if (typeof formatter.formatRange === "function") return formatter.formatRange(start, end);
    return `${formatter.format(start)} – ${formatter.format(end)}`;
  }

  function getCurrentStudy(date = new Date()) {
    const today = new Date(date);
    today.setHours(0, 0, 0, 0);
    const rawIndex = Math.floor((today - firstMonday) / (7 * oneDay));
    const index = Math.max(0, Math.min(pages.length - 1, rawIndex));
    const start = new Date(firstMonday.getTime() + index * 7 * oneDay);
    const end = new Date(start.getTime() + 6 * oneDay);
    return {
      week: index + 1,
      page: pages[index],
      title: titles[index],
      dates: formatRange(start, end),
      active: rawIndex >= 0 && rawIndex < pages.length
    };
  }

  window.TACEF_STUDY_SCHEDULE = { pages, titles, getCurrentStudy };
})();
