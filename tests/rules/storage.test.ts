// Storage rules: who may read / upload / overwrite / delete each path; size + type limits;
// guests never upload.
import { describe, test } from 'node:test';
import { ref, uploadBytes, getMetadata, deleteObject } from 'firebase/storage';
import { setupRulesEnv, as, ok, no, UID, PNG } from './env';

setupRulesEnv({ storage: true });
const st = (p: keyof typeof as) => as[p]().storage();
const put = (p: keyof typeof as, path: string, contentType = 'image/jpeg', data: Uint8Array = PNG) =>
  uploadBytes(ref(st(p), path), data, { contentType });
const read = (p: keyof typeof as, path: string) => getMetadata(ref(st(p), path));
const del = (p: keyof typeof as, path: string) => deleteObject(ref(st(p), path));
const MB = (n: number) => new Uint8Array(n * 1024 * 1024 + 1);

describe('products (public catalogue photos)', () => {
  const B = 'st:products/{productId}/{imageId}';
  test('anyone reads; admins upload images < 10 MB and delete', async () => {
    await ok(B, read('unauth', 'products/p1/k1.jpg'));
    await ok(B, put('admin', 'products/p1/k2.jpg'));
    await ok(B, del('admin', 'products/p1/k2.jpg'));
    await no(B, put('A', 'products/p1/k3.jpg'));
    await no(B, put('admin', 'products/p1/k4.html', 'text/html'));
    await no(B, put('admin', 'products/p1/k5.jpg', 'image/jpeg', MB(10)));
    await no(B, del('A', 'products/p1/k1.jpg'));
  });
});

describe('chat media (evidence)', () => {
  for (const [kind, block, file, ct, limit] of [
    ['images', 'st:chat-images/{uid}/{fileName}', '2.jpg', 'image/jpeg', 10],
    ['videos', 'st:chat-videos/{uid}/{fileName}', '2.mp4', 'video/mp4', 60],
  ] as const) {
    test(`chat ${kind}`, async () => {
      const mine = `chat-${kind}/${UID.A}`;
      await ok(block, read('A', `${mine}/1.${file.split('.')[1]}`));
      await ok(block, read('admin', `${mine}/1.${file.split('.')[1]}`));
      await ok(block, put('A', `${mine}/${file}`, ct));
      await ok(block, put('admin', `${mine}/admin-${file}`, ct));
      await no(block, read('B', `${mine}/1.${file.split('.')[1]}`));
      await no(block, put('B', `${mine}/b-${file}`, ct));                 // someone else's folder
      await no(block, put('guest', `chat-${kind}/${UID.GUEST}/${file}`, ct));
      await no(block, put('A', `${mine}/${file}`, ct));                   // overwrite a sent file
      await no(block, put('A', `${mine}/x.pdf`, 'application/pdf'));
      await no(block, put('A', `${mine}/big-${file}`, ct, MB(limit)));
      await no(block, del('A', `${mine}/${file}`));
    });
  }
});

describe('checklist photos + rental agreements (staff)', () => {
  test('checklist photos: admin only, never deleted', async () => {
    const B = 'st:reservations/{reservationId}/{checklistType}/{fileName}';
    await ok(B, read('admin', 'reservations/rA/handover/1.jpg'));
    await ok(B, put('admin', 'reservations/rA/return/1.jpg'));
    await no(B, read('A', 'reservations/rA/handover/1.jpg'));
    await no(B, put('A', 'reservations/rA/return/2.jpg'));
    await no(B, put('admin', 'reservations/rA/handover/1.jpg'));          // replace a condition photo
    await no(B, del('admin', 'reservations/rA/handover/1.jpg'));
  });
  test('agreements: the renter of that agreement reads it; admin creates once', async () => {
    const B = 'st:rentalAgreements/{agreementId}/{fileName}';
    await ok(B, read('A', 'rentalAgreements/ag1/agreement.pdf'));
    await ok(B, put('admin', 'rentalAgreements/ag2/agreement.pdf', 'application/pdf'));
    await no(B, read('B', 'rentalAgreements/ag1/agreement.pdf'));
    await no(B, put('admin', 'rentalAgreements/ag1/agreement.pdf', 'application/pdf')); // overwrite
    await no(B, put('A', 'rentalAgreements/ag3/agreement.pdf', 'application/pdf'));
    await no(B, del('admin', 'rentalAgreements/ag1/agreement.pdf'));
  });
});

describe('claims evidence', () => {
  for (const [kind, block, ext, ct, limit] of [
    ['photos', 'st:claim-photos/{uid}/{fileName}', 'jpg', 'image/jpeg', 10],
    ['videos', 'st:claim-videos/{uid}/{fileName}', 'mp4', 'video/mp4', 50],
  ] as const) {
    test(`claim ${kind}: owner creates once; never overwritten / deleted`, async () => {
      const mine = `claim-${kind}/${UID.A}`;
      await ok(block, read('A', `${mine}/1_0.${ext}`));
      await ok(block, put('A', `${mine}/2_0.${ext}`, ct));
      await no(block, put('A', `${mine}/1_0.${ext}`, ct));                 // overwrite evidence
      await no(block, put('B', `${mine}/3_0.${ext}`, ct));
      await no(block, put('admin', `${mine}/4_0.${ext}`, ct));             // staff can't plant evidence
      await no(block, put('guest', `claim-${kind}/${UID.GUEST}/1.${ext}`, ct));
      await no(block, put('A', `${mine}/5_0.${ext}`, 'text/plain'));
      await no(block, put('A', `${mine}/6_0.${ext}`, ct, MB(limit)));
      await no(block, read('B', `${mine}/1_0.${ext}`));
      await no(block, del('A', `${mine}/1_0.${ext}`));
    });
  }
});

describe('profile photos, business documents, ID documents', () => {
  test('profile photos: owner uploads < 5 MB (replace OK), owner/admin delete', async () => {
    const B = 'st:profile-photos/{uid}/{fileName}';
    await ok(B, put('A', `profile-photos/${UID.A}/2.jpg`));
    await ok(B, read('admin', `profile-photos/${UID.A}/1.jpg`));
    await ok(B, del('A', `profile-photos/${UID.A}/2.jpg`));
    await no(B, put('A', `profile-photos/${UID.A}/3.jpg`, 'image/jpeg', MB(5)));
    await no(B, put('B', `profile-photos/${UID.A}/4.jpg`));
    await no(B, put('guest', `profile-photos/${UID.GUEST}/1.jpg`));
    await no(B, read('B', `profile-photos/${UID.A}/1.jpg`));
  });
  test('business documents: owner creates once, never overwritten or deleted', async () => {
    const B = 'st:businessDocs/{uid}/{fileName}';
    await ok(B, read('admin', `businessDocs/${UID.BIZ}/1.jpg`));
    await ok(B, put('biz', `businessDocs/${UID.BIZ}/2.jpg`));
    await no(B, put('biz', `businessDocs/${UID.BIZ}/1.jpg`));          // overwrite the reviewed doc
    await no(B, read('A', `businessDocs/${UID.BIZ}/1.jpg`));
    await no(B, put('guest', `businessDocs/${UID.GUEST}/1.jpg`));
    await no(B, del('biz', `businessDocs/${UID.BIZ}/1.jpg`));
  });
  test('ID documents: owner / admin create images, no overwrite, NEVER deleted by a client', async () => {
    const B = 'st:idDocs/{uid}/{fileName}';
    await ok(B, read('A', `idDocs/${UID.A}/id_1_1.jpg`));
    await ok(B, put('A', `idDocs/${UID.A}/id_2_1.jpg`));
    await ok(B, put('admin', `idDocs/${UID.B}/counter_1_1.jpg`));
    await no(B, read('B', `idDocs/${UID.A}/id_1_1.jpg`));
    await no(B, put('A', `idDocs/${UID.A}/id_1_1.jpg`));
    await no(B, put('B', `idDocs/${UID.A}/id_3_1.jpg`));
    await no(B, put('guest', `idDocs/${UID.GUEST}/id_1_1.jpg`));
    await no(B, put('A', `idDocs/${UID.A}/id.pdf`, 'application/pdf'));
    await no(B, put('A', `idDocs/${UID.A}/big.jpg`, 'image/jpeg', MB(10)));
    await no(B, del('A', `idDocs/${UID.A}/id_1_1.jpg`));
    await no(B, del('admin', `idDocs/${UID.A}/id_1_1.jpg`));
  });
});

describe('home slides + onboarding (admin media)', () => {
  for (const [block, path] of [
    ['st:homeSlides/{slideId}/{fileName}', 'homeSlides/h1'],
    ['st:onboarding/{slot}/{fileName}', 'onboarding/s1p1'],
  ] as const) {
    test(path.split('/')[0], async () => {
      await ok(block, read('guest', `${path}/1.jpg`));
      await ok(block, put('admin', `${path}/2.jpg`));
      await ok(block, del('admin', `${path}/2.jpg`));
      await no(block, read('unauth', `${path}/1.jpg`));
      await no(block, put('A', `${path}/3.jpg`));
      await no(block, del('A', `${path}/1.jpg`));
    });
  }
});

describe('everything else', () => {
  test('unknown paths: nobody (admin included)', async () => {
    const B = 'st:{allPaths=**}';
    await no(B, read('admin', 'misc/other.txt'));
    await no(B, put('admin', 'misc/new.jpg'));
    await no(B, put('A', `uploads/${UID.A}/x.jpg`));
  });
});
