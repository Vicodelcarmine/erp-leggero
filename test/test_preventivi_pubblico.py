"""Il telefono può chiedere il link; il resto del Mac resta chiuso."""
import unittest

import servi


class PreventiviPubbliciTest(unittest.TestCase):
    def test_il_link_e_la_sua_api_passano(self):
        self.assertTrue(servi._pubblico_ammesso("/preventivo/r/abc"))
        self.assertTrue(servi._pubblico_ammesso("/api/preventivi"))
        self.assertTrue(servi._pubblico_ammesso("/api/preventivi/abc/excel"))

    def test_il_resto_del_programma_non_passa(self):
        self.assertFalse(servi._pubblico_ammesso("/"))
        self.assertFalse(servi._pubblico_ammesso("/api/cassa"))
        self.assertFalse(servi._pubblico_ammesso("/cassa-drive"))
        self.assertFalse(servi._pubblico_ammesso("/fatture-mail"))

    def test_solo_il_sito_del_telefono_e_accettato(self):
        self.assertTrue(servi._origine_telefono("https://vicodelcarmine.github.io"))
        self.assertFalse(servi._origine_telefono("https://anyou-ai.github.io"))
        self.assertFalse(servi._origine_telefono(""))


if __name__ == "__main__":
    unittest.main()
