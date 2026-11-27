export default function Index() {
  return (
    <s-page heading="Lensify">
      <s-section heading="Storefront try-on">
        <s-paragraph>
          Add the Try On Glasses app block to a collection page in your theme
          editor. Open that storefront page and choose Try On Glasses to test
          the camera.
        </s-paragraph>
      </s-section>
      <s-section heading="Set up the 360° product viewer">
        <s-paragraph>
          Shoppers see View in 360° when the product has a 3D model and its
          product template includes the Lensify 360° view block.
        </s-paragraph>
        <ol>
          <li>In Shopify admin, go to Products and open the product you want to show in 360°.</li>
          <li>Under Media, choose Upload new, select the product’s .glb file, and save.</li>
          <li>In the theme editor, open that product’s template, add the Lensify 360° view app block, and save.</li>
        </ol>
        <s-paragraph>
          Add the block once per product template. Upload a model for each
          product you want shoppers to rotate.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
