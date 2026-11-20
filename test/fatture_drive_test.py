# -*- coding: utf-8 -*-
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fatture_drive


class FattureDriveTest(unittest.TestCase):
    def test_la_cartella_non_e_quella_della_cassa(self):
        self.assertNotIn(fatture_drive.CARTELLA_ID, fatture_drive.VIETATE)
        self.assertEqual(fatture_drive.CARTELLA_NOME, "Fatture Metro")

    def test_cartella_vuota_dice_nessuna_mail_nuova(self):
        out = fatture_drive.risposta([])
        self.assertTrue(out["ok"])
        self.assertEqual(out["pdf"], [])
        self.assertEqual(out["messaggio"], "Nessuna mail nuova.")
        self.assertEqual(out["caselle"], ["vicodelcarmine1@gmail.com"])

    def test_un_errore_non_inventa_fatture(self):
        out = fatture_drive.risposta([], "Non vedo la cartella Drive Fatture Metro.")
        self.assertFalse(out["ok"])
        self.assertEqual(out["pdf"], [])


if __name__ == "__main__":
    unittest.main()
